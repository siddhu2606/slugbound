// Unit tests for the C++ engine. Run with:  ./build.sh test
#include "../engine/game.h"
using namespace Game;
using namespace Game::Combat;
using namespace Game::World;

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { cout << "FAIL line " << __LINE__ << ": " #cond << endl; failures++; } } while (0)

static void testDiamond() {
    Slinger s("T");
    Entity* e = &s;                                   // one Entity inside the Slinger
    Combatant* c = &s;
    Explorer* x = &s;
    CHECK(static_cast<Entity*>(c) == e);
    CHECK(static_cast<Entity*>(x) == e);              // both bases lead to the SAME Entity
    s.heal(1).addAmmo(2);                             // this-chaining
}

static void testElements() {
    CHECK(DamageCalculator::multiplier(FIRE, ICE) == 2.0f);
    CHECK(DamageCalculator::multiplier(ICE, FIRE) == 0.5f);
    CHECK(DamageCalculator::multiplier(ENERGY, FIRE) == 2.0f);
    CHECK(DamageCalculator::multiplier(FIRE, EARTH) == 1.0f);
    CHECK(DamageCalculator::multiplier(GHOUL, FIRE) == 1.0f);
}

static void testBlasterDeepCopy() {
    Blaster a;
    a.add(new FireSlug(2));
    a.add(new IceSlug(3));
    Blaster b(a);                                     // deep copy through clone()
    vector<Slug*> va = a.contents(), vb = b.contents();
    CHECK(va.size() == vb.size());
    CHECK(va[0] != vb[0]);                            // different objects
    CHECK(vb[0]->className() == "FireSlug");          // same real type
    CHECK(vb[1]->className() == "IceSlug");
    vb[0]->takeDamage(5);
    CHECK(va[0]->getHp() != vb[0]->getHp());          // independent
    Slug* f = a.fire();                               // front goes to the back
    CHECK(f == va[0] && a.front() == va[1]);
    a.swap();
    CHECK(a.front() == va[0]);
}

static void testFusionAndOperators() {
    FireSlug f(3);
    IceSlug i(3);
    Slug* g = f + i;                                  // operator+
    CHECK(g->className() == "GhoulSlug");
    CHECK(g->getElement() == GHOUL);
    CHECK(*g > f);                                    // operator>
    int before = g->getLevel();
    ++(*g);
    CHECK(g->getLevel() == before + 1);
    *g += 500;                                        // operator+=
    CHECK(g->getLevel() > before + 1);
    delete g;
}

static void testTemplates() {
    Inventory<int> inv;
    inv.add(4);
    CHECK(inv[0] == 4);
    bool threw = false;
    try { inv[5]; } catch (GameException&) { threw = true; }
    CHECK(threw);
    CHECK(clampValue(15, 0, 10) == 10);
    CHECK(clampValue(-1.5f, 0.0f, 1.0f) == 0.0f);
    vector<int> v;
    v.push_back(3); v.push_back(9); v.push_back(5);
    CHECK(findMax(v) == 9);
}

static void testGateUnwinding() {
    Slinger s("T");
    s.addSlug(new FireSlug(1));
    GapLedge gap("gap", Position(1, 1));
    Logger::take();
    bool locked = false;
    try { gap.interact(s); } catch (GateLockedException&) { locked = true; }
    CHECK(locked);
    list<string> lines = Logger::take();
    vector<string> v(lines.begin(), lines.end());
    int posThrow = -1, posD1 = -1, posD2 = -1;
    for (size_t k = 0; k < v.size(); k++) {
        if (v[k].find("[throw]") == 0) posThrow = (int)k;
        if (v[k].find("slug scan' destroyed") != string::npos) posD1 = (int)k;
        if (v[k].find("gate check") != string::npos && v[k].find("destroyed") != string::npos) posD2 = (int)k;
    }
    CHECK(posThrow >= 0 && posD1 > posThrow && posD2 > posD1);   // destroyed in REVERSE order, after the throw
    s.addSlug(new AirSlug(1));
    s.blaster.swap();
    CHECK(gap.interact(s).type == "gate_open");
}

static void testBattleLoseRestoresSnapshot() {
    Slinger s("T");
    s.addSlug(new FireSlug(1));
    int uid = s.blaster.front()->getUid();
    Enemy* brute = new Enemy("Brute", GHOUL, 9, 5000, 40, "ghoul");
    Battle b(s, brute, "x");
    int guard = 0;
    while (!b.isOver() && guard++ < 50) {
        b.fire();
        if (!b.isOver()) b.enemyTurn();
    }
    CHECK(b.getResult() == "lose");
    CHECK(s.blaster.size() == 1);                     // restored from the deep-copied backup
    CHECK(s.blaster.front()->getUid() == uid);
    CHECK(s.blaster.front()->isAlive());
    CHECK(s.storage.size() == 0);                     // no duplicate left in storage
}

static void testBossStackAndPhases() {
    BossEnemy boss("G", 10, 100, 10);
    FireSlug f(5);
    Enemy* e = &boss;
    e->takeDamage(40);                                // 60% left -> phase 2
    CHECK(e->onDamaged().find("PHASE 2") != string::npos);
    CHECK(boss.minionCount() == 3);
    int hpBefore = boss.getHp();
    CHECK(e->takeHit(30) == -1);                      // top minion absorbs, LIFO
    CHECK(boss.minionCount() == 2);
    CHECK(boss.getHp() == hpBefore);
    e->takeHit(1); e->takeHit(1);
    CHECK(boss.minionCount() == 0);
    CHECK(e->takeHit(10) == 10);
}

static void testSaveRoundTripAndCorruption() {
    GameEngine g("test_save.sav");
    Logger::echo = false;
    g.handle("/move", "{\"dir\":\"right\"}");
    string r = g.handle("/interact", "");             // not facing anything useful, fine
    CHECK(g.handle("/save").find("\"saved\":true") != string::npos);
    CHECK(g.handle("/load").find("\"loaded\":true") != string::npos);
    { ofstream bad("test_bad.sav", ios::binary); bad << "not a save file at all"; }
    GameEngine g2("test_bad.sav");
    string res = g2.handle("/load");
    CHECK(res.find("SaveCorruptedException") != string::npos);   // game answers with an error, does not crash
    CHECK(g2.handle("/state").find("\"ok\":true") != string::npos);
    { ifstream in("test_save.sav", ios::binary); string all((istreambuf_iterator<char>(in)), istreambuf_iterator<char>());
      ofstream cut("test_cut.sav", ios::binary); cut << all.substr(0, all.size() / 2); }
    GameEngine g3("test_cut.sav");
    CHECK(g3.handle("/load").find("SaveCorruptedException") != string::npos);
    remove("test_save.sav"); remove("test_bad.sav"); remove("test_cut.sav");
}

static void testEngineFlow() {
    GameEngine g("flow.sav");
    Logger::echo = false;
    string st = g.handle("/state");
    CHECK(st.find("Glowmoss Grotto") != string::npos);
    string z = g.handle("/zone");
    CHECK(z.find("\"rows\"") != string::npos);
    CHECK(g.handle("/fire").find("\"ok\":false") != string::npos);   // no duel yet
    CHECK(g.handle("/nonsense").find("Unknown route") != string::npos);
}

int main() {
    Logger::echo = false;
    testDiamond();
    testElements();
    testBlasterDeepCopy();
    testFusionAndOperators();
    testTemplates();
    testGateUnwinding();
    testBattleLoseRestoresSnapshot();
    testBossStackAndPhases();
    testSaveRoundTripAndCorruption();
    testEngineFlow();
    remove("battle_log.txt");
    if (failures == 0) cout << "All engine tests passed" << endl;
    else cout << failures << " test(s) FAILED" << endl;
    return failures == 0 ? 0 : 1;
}
