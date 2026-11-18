#include "game.h"

namespace Game {

using namespace World;
using namespace Combat;

static OOPCard exceptionCard() {
    OOPCard c;
    c.title = "THE LOCKED GATE";
    c.badge = "Exceptions";
    c.classLine = "class GateLockedException : public GameException";
    c.inherits = "GameException -> std::exception";
    c.data = "string msg  (what() returns it)";
    c.funcs.push_back("throw  <- raised deep inside Gate::interact()");
    c.funcs.push_back("catch (GateLockedException&)  <- the main loop answers it");
    c.funcs.push_back("catch (GameException&)  <- one catch handles every game error");
    c.oop.push_back("STACK UNWINDING: [throw] then [dtor] ScopedLogger x2 in REVERSE order, then [catch]");
    c.oop.push_back("Catch by REFERENCE: avoids slicing the exception object");
    c.oop.push_back("Specific catches first, the base class last");
    c.viva = "When an exception is thrown, C++ destroys every local object between the throw and the matching catch, in reverse order of construction. Our console shows that order.";
    return c;
}

static OOPCard destructorCard() {
    OOPCard c;
    c.title = "A SLUG FAINTS";
    c.badge = "Destructors";
    c.classLine = "virtual ~Slug()  and  ~FireSlug()";
    c.inherits = "Slug (abstract) with a virtual destructor";
    c.data = "static int totalSlugs  (counts live slugs)";
    c.funcs.push_back("virtual ~Slug()  <- prints [dtor] Slug base destroyed");
    c.funcs.push_back("~FireSlug()      <- runs FIRST, prints [dtor] FireSlug");
    c.funcs.push_back("Battle::~Battle() <- deletes the Enemy*, virtual ~Enemy()");
    c.oop.push_back("DESTRUCTOR ORDER: derived part first, then the base");
    c.oop.push_back("VIRTUAL DESTRUCTOR: delete on a Slug* still runs ~FireSlug");
    c.oop.push_back("STATIC MEMBER: totalSlugs goes down with every [dtor]");
    c.viva = "delete on a Slug* that points at a FireSlug must run ~FireSlug first. Without a virtual destructor only the base part would be cleaned up.";
    return c;
}

GameEngine::GameEngine(const string& saveFile)
    : player(0), world(0), battle(0), victory(false), savePath(saveFile), debugRoutes(false) {
    const char* seed = getenv("SLUG_SEED");            // fixed seed = repeatable run (used by the CI bot)
    srand(seed ? (unsigned)atoi(seed) : (unsigned)time(0));
    freshGame();
}

GameEngine::~GameEngine() {
    delete battle;
    delete player;
    delete world;
}

void GameEngine::freshGame() {
    delete battle;
    battle = 0;
    delete player;
    delete world;
    pendingCards.clear();
    victory = false;
    player = new Slinger("Kai");
    world = new WorldMap();
    player->setPos(world->get("grotto")->getStart());
}

// ---------- tutorial cards ----------
string GameEngine::cardJson(int step) const {
    OOPCard c;
    switch (step) {
        case 1: c = player->describeOOP(); break;
        case 2: {
            Slug* f = player->blaster.front();
            if (f) c = f->describeOOP();
            else c = FireSlug().describeOOP();
            break;
        }
        case 3: c = player->pedia.describeOOP(); break;
        case 4: c = player->blaster.describeOOP(); break;
        case 5: c = Battle::describeOOP(); break;
        case 6: c = DamageCalculator::describeOOP(); break;
        case 7: c = world->get("grotto")->objectById("g_wall")->describeOOP(); break;
        case 8: c = exceptionCard(); break;
        case 9: c = world->get("grotto")->objectById("g_fusion")->describeOOP(); break;
        case 10: c = SaveManager::describeOOP(); break;
        default: c = destructorCard(); break;
    }
    JsonObj o;
    o.add("step", step).add("total", 11).raw("card", c.toJson());
    return o.str();
}

void GameEngine::unlock(int step) {
    if (player->cardsShown.count(step)) return;
    player->cardsShown.insert(step);
    pendingCards.push_back(cardJson(step));
}

string GameEngine::objective() const {
    const set<int>& c = player->cardsShown;
    if (!c.count(1)) return "Walk around with WASD or the arrow keys";
    if (!player->hasFlag("starter")) return "Talk to Old Mossback (face him and press E)";
    if (!c.count(3)) return "Press P to open your Slugpedia";
    if (!c.count(4)) return "Press B to open your blaster";
    if (!c.count(5)) return "Step into the glowing moss and duel a wild slug";
    if (!player->hasFlag("gift_boulder")) return "Talk to Old Mossback again";
    if (!c.count(7)) return "Load Boulderback (B), then smash the cracked wall in the east";
    if (!c.count(8)) return "Walk into the chasm ledge beyond the wall";
    if (!c.count(9)) return "Fuse two slugs at the Fusion Stone (E)";
    if (!c.count(10)) return "Save your game (Esc menu)";
    if (player->keystoneCount() < 3)
        return "Find the 3 keystones (" + to_string(player->keystoneCount()) + "/3): Crystal Hollows has two, Magma Vein one";
    if (!player->hasFlag("boss_down")) return "Open Gorvax's Keep in the Magma Vein and defeat him";
    return "Touch the Heartcrystal to relight Hollowdeep";
}

string GameEngine::stateJson() const {
    JsonObj s;
    s.raw("player", player->toJson());
    s.add("zone", player->zoneId).add("zoneName", zone()->getName());
    vector<string> b, st;
    vector<Slug*> v = player->blaster.contents();
    for (size_t i = 0; i < v.size(); i++) b.push_back(v[i]->toJson());
    for (int i = 0; i < player->storage.size(); i++) st.push_back(player->storage[i]->toJson());
    s.raw("blaster", jarr(b)).raw("storage", jarr(st));
    vector<string> found(player->pedia.foundSet().begin(), player->pedia.foundSet().end());
    s.raw("found", jstrs(found));
    vector<string> shown;
    for (set<int>::const_iterator it = player->cardsShown.begin(); it != player->cardsShown.end(); ++it) shown.push_back(to_string(*it));
    JsonObj t;
    t.raw("shown", jarr(shown)).add("objective", objective()).add("total", 11);
    s.raw("tutorial", t.str());
    JsonObj stats;
    stats.add("totalSlugs", Slug::getTotalSlugs()).add("battleCount", Battle::getBattleCount());
    stats.add("calcCount", DamageCalculator::getCalcCount());
    s.raw("stats", stats.str());
    s.add("inBattle", battle != 0).add("victory", victory).add("bossDown", player->hasFlag("boss_down"));
    return s.str();
}

string GameEngine::finish(JsonObj& o, bool ok) {
    o.add("ok", ok);
    o.raw("state", stateJson());
    list<string> lines = Logger::take();
    vector<string> v(lines.begin(), lines.end());
    o.raw("log", jstrs(v));
    o.raw("cards", jarr(pendingCards));
    pendingCards.clear();
    return o.str();
}

string GameEngine::eventJson(const Outcome& out) {
    JsonObj e;
    e.add("type", out.type).add("text", out.text).add("speaker", out.speaker);
    e.raw("lines", jstrs(out.lines)).raw("extra", out.extra).add("source", out.source);
    return e.str();
}

// ---------- movement and interaction ----------
string GameEngine::startBattle(JsonObj& o, Outcome& out) {
    if (player->blaster.size() == 0) {
        delete out.enemy;
        out.enemy = 0;
        Outcome m;
        m.type = "msg";
        m.text = "You have no healthy slugs to duel with! Heal at a heart shard.";
        o.raw("event", eventJson(m));
        return finish(o);
    }
    battle = new Battle(*player, out.enemy, out.source);
    out.enemy = 0;                                       // the Battle owns it now
    o.raw("event", eventJson(out));
    o.raw("battle", battle->stateJson());
    return finish(o);
}

string GameEngine::doMove(const string& body) {
    if (battle) throw InvalidMoveException("Finish the duel first");
    Direction d = parseDirection(reqStr(body, "dir"));
    Zone* z = zone();
    player->face(d);
    Position t = stepFrom(player->getPos(), d);
    bool moved = false, zoneChanged = false, haveOut = false;
    Outcome out;
    Interactable* obj = z->objectAt(t);
    if (obj && obj->blocksMovement()) {
        haveOut = true;
        if (dynamic_cast<Gate*>(obj)) {
            out = z->interact(obj, *player);             // may throw GateLockedException
            if (out.type == "gate_open" && obj->kind() == "wall") unlock(7);
        } else {
            out.type = "bump";
            out.text = obj->describe();
            out.source = obj->getId();
        }
    } else if (!z->walkable(t)) {
        haveOut = true;
        out.type = "blocked";
    } else {
        const ZoneExit* ex = z->exitAt(t);
        if (ex && player->blaster.size() == 0) {
            haveOut = true;
            out.type = "msg";
            out.text = "You cannot leave without a healthy slug. Talk to Old Mossback.";
        } else {
            player->moveTo(t);
            moved = true;
            unlock(1);
            if (ex) {
                player->zoneId = ex->toZone;
                player->setPos(ex->toPos);
                zoneChanged = true;
                Logger::log("zone", "Entering " + zone()->getName());
            }
        }
    }
    if (moved && !zoneChanged) {
        z = zone();
        for (size_t i = 0; i < z->objectList().size() && !haveOut; i++) {
            GhoulPatrol* gp = dynamic_cast<GhoulPatrol*>(z->objectList()[i]);     // downcast
            if (!gp || gp->isDone()) continue;
            int dx = abs(gp->getPos().x - t.x), dy = abs(gp->getPos().y - t.y);
            if (dx + dy <= gp->getSight() && (dx == 0 || dy == 0)) {
                out = gp->interact(*player);
                haveOut = true;
            }
        }
        WildPatch* wp = z->patch();
        if (!haveOut && wp && player->blaster.size() > 0 && z->tile(t.x, t.y) == 'm') {
            bool first = player->hasFlag("starter") && !player->hasFlag("seen_wild") && player->zoneId == "grotto";
            if (first) { out = wp->forced(ICE, 1); haveOut = true; }
            else if (rand() % 100 < wp->getRate()) { out = wp->interact(*player); haveOut = true; }
        }
    }
    JsonObj o;
    o.add("moved", moved).add("zoneChanged", zoneChanged).add("dir", directionName(d));
    o.add("x", player->getPos().x).add("y", player->getPos().y);
    if (haveOut && out.type == "battle") return startBattle(o, out);
    if (haveOut) o.raw("event", eventJson(out));
    return finish(o);
}

string GameEngine::doInteract() {
    if (battle) throw InvalidMoveException("Finish the duel first");
    Zone* z = zone();
    Interactable* obj = z->objectAt(player->ahead());
    JsonObj o;
    if (!obj) {
        Outcome m;
        m.type = "msg";
        m.text = "Nothing there.";
        o.raw("event", eventJson(m));
        return finish(o);
    }
    Outcome out = z->interact(obj, *player);
    if (player->hasFlag("starter")) unlock(2);
    if (out.type == "gate_open" && obj->kind() == "wall") unlock(7);
    if (out.type == "victory") {
        victory = true;
        vector<string> concepts;
        concepts.push_back("Virtual inheritance and the diamond (Slinger)");
        concepts.push_back("Abstract classes and pure virtual functions (Slug, Interactable)");
        concepts.push_back("Polymorphism and virtual destructors (Slug*, Enemy*)");
        concepts.push_back("Templates (Inventory<T>, Registry<T>, clampValue<T>)");
        concepts.push_back("Operator overloading (Slug + Slug fusion)");
        concepts.push_back("STL: queue, stack, map, set, vector, list");
        concepts.push_back("Exceptions and stack unwinding");
        concepts.push_back("Binary file handling with polymorphic loading");
        concepts.push_back("Friend classes, static members, this-chaining, overloading");
        out.extra = "{\"concepts\":" + jstrs(concepts) + "}";
    }
    if (out.type == "battle") return startBattle(o, out);
    o.raw("event", eventJson(out));
    return finish(o);
}

// ---------- duel ----------
string GameEngine::afterBattleAction(JsonObj& o) {
    o.raw("battle", battle->stateJson());
    if (battle->isOver()) {
        string result = battle->getResult();
        string src = battle->getSource();
        bool faint = battle->hadFaint();
        o.add("over", true).add("result", result);
        if (result == "win") {
            Interactable* so = zone()->objectById(src);
            if (so) so->setDone(true);
            if (src == "k_boss") player->setFlag("boss_down");
            unlock(6);
        }
        if (faint || result == "lose") unlock(11);
        if (result == "lose") {
            player->zoneId = "grotto";
            player->setPos(world->get("grotto")->getStart());
            player->setHp(player->getMaxHp());
            o.add("respawn", true);
        }
        delete battle;                                   // ~Battle deletes the Enemy*
        battle = 0;
    }
    return finish(o);
}

string GameEngine::doMoss() {
    if (!battle) {
        if (!player->useItem("Healing Moss")) throw GameException("No Healing Moss left");
        vector<Slug*> v = player->blaster.contents();
        for (size_t i = 0; i < v.size(); i++) v[i]->healBy(40);
        player->heal(40);
        JsonObj o;
        Outcome m;
        m.type = "msg";
        m.text = "Healing Moss mends your blaster slugs.";
        o.raw("event", eventJson(m));
        return finish(o);
    }
    JsonObj o;
    o.raw("action", battle->moss());
    return afterBattleAction(o);
}

// ---------- slugs ----------
string GameEngine::doFuse(const string& body) {
    if (battle) throw InvalidMoveException("Not during a duel");
    int ia = reqInt(body, "a", -1), ib = reqInt(body, "b", -1);
    Slug* a = player->findSlug(ia);
    Slug* b = player->findSlug(ib);
    if (!a || !b || a == b) throw InvalidMoveException("Pick two different slugs to fuse");
    Slug* g = *a + *b;                                   // operator+ returns a new GhoulSlug
    string parents = a->getName() + " + " + b->getName();
    player->releaseSlug(ia);                             // the parents are lost: destructors run
    player->releaseSlug(ib);
    string gj = g->toJson();
    player->addSlug(g);
    unlock(9);
    JsonObj o;
    o.raw("fused", gj).add("parents", parents);
    return finish(o);
}

string GameEngine::doTrade(const string& body) {
    if (battle) throw InvalidMoveException("Not during a duel");
    int id = reqInt(body, "id", -1);
    Slug* spare = 0;
    for (int i = 0; i < player->storage.size(); i++)
        if (player->storage[i]->getUid() == id) spare = player->storage[i];
    if (!spare) throw InvalidMoveException("Trader Pim only wants spare slugs from storage");
    int lvl = max(2, spare->getLevel());
    player->releaseSlug(id);
    Slug* v = new EnergySlug(lvl);
    string vj = v->toJson();
    player->addSlug(v);
    JsonObj o;
    o.raw("got", vj);
    return finish(o);
}

string GameEngine::doLoadout(const string& body) {
    if (battle) throw InvalidMoveException("Not during a duel");
    vector<int> ids = reqInts(body, "ids");
    if (ids.empty() || ids.size() > 4) throw InvalidMoveException("Load between 1 and 4 slugs");
    vector<Slug*> chosen;
    for (size_t i = 0; i < ids.size(); i++) {
        Slug* s = player->findSlug(ids[i]);
        if (!s) throw InvalidMoveException("Unknown slug");
        if (!s->isAlive()) throw InvalidMoveException(s->getName() + " has fainted. Heal at a heart shard first");
        for (size_t j = 0; j < chosen.size(); j++)
            if (chosen[j] == s) throw InvalidMoveException("A slug can only be loaded once");
        chosen.push_back(s);
    }
    vector<Slug*> all = player->allSlugs();
    player->blaster.releaseAll();                        // ownership moves, nothing is deleted
    player->storage.clear();
    for (size_t i = 0; i < chosen.size(); i++) player->blaster.add(chosen[i]);
    for (size_t i = 0; i < all.size(); i++) {
        bool in = false;
        for (size_t j = 0; j < chosen.size(); j++)
            if (chosen[j] == all[i]) in = true;
        if (!in) player->storage.add(all[i]);
    }
    Logger::log("queue", "Blaster loaded with " + to_string(chosen.size()) + " slugs (front fires first)");
    JsonObj o;
    return finish(o);
}

string GameEngine::doRelease(const string& body) {
    if (battle) throw InvalidMoveException("Not during a duel");
    int id = reqInt(body, "id", -1);
    if (player->allSlugs().size() <= 1) throw InvalidMoveException("You cannot release your last slug");
    if (!player->releaseSlug(id)) throw InvalidMoveException("Unknown slug");
    unlock(11);
    JsonObj o;
    return finish(o);
}

string GameEngine::doInspect(const string& query) {
    size_t p = query.find("id=");
    string id = (p == string::npos) ? "" : query.substr(p + 3);
    OOPCard c;
    if (id == "player") c = player->describeOOP();
    else if (id.compare(0, 5, "slug:") == 0) {
        Slug* s = player->findSlug(atoi(id.c_str() + 5));
        if (!s) throw GameException("Unknown slug");
        c = s->describeOOP();
    } else if (id.compare(0, 4, "obj:") == 0) {
        Interactable* o = zone()->objectById(id.substr(4));
        if (!o) throw GameException("Unknown object");
        c = o->describeOOP();
    } else if (id.compare(0, 6, "pedia:") == 0) c = player->pedia.cardFor(id.substr(6));
    else if (id == "enemy") {
        if (!battle) throw GameException("No duel running");
        c = battle->enemyCard();
    } else if (id == "class:Blaster") c = player->blaster.describeOOP();
    else if (id == "class:Slugpedia") c = player->pedia.describeOOP();
    else if (id == "class:Battle") c = Battle::describeOOP();
    else if (id == "class:Damage") c = DamageCalculator::describeOOP();
    else if (id == "class:World") c = world->describeOOP();
    else if (id == "class:Save") c = SaveManager::describeOOP();
    else if (id == "class:Exception") c = exceptionCard();
    else if (id == "class:Destructor") c = destructorCard();
    else throw GameException("Nothing to inspect for '" + id + "'");
    JsonObj o;
    o.raw("card", c.toJson());
    return finish(o);
}

string GameEngine::doSave() {
    if (battle) throw InvalidMoveException("Not during a duel");
    SaveManager::save(savePath, *player, *world);
    unlock(10);
    JsonObj o;
    o.add("saved", true).add("path", savePath);
    return finish(o);
}

string GameEngine::doLoad() {
    if (battle) throw InvalidMoveException("Not during a duel");
    SaveManager::load(savePath, player, world);
    pendingCards.clear();
    JsonObj o;
    o.add("loaded", true);
    return finish(o);
}

// ---------- the router ----------
string GameEngine::handle(const string& fullRoute, const string& body) {
    string route = fullRoute, query;
    size_t q = fullRoute.find('?');
    if (q != string::npos) {
        route = fullRoute.substr(0, q);
        query = fullRoute.substr(q + 1);
    }
    try {
        JsonObj o;
        if (route == "/new") { freshGame(); o.add("new", true); return finish(o); }
        if (route == "/state" || route == "/ping") return finish(o);
        if (route == "/zone") {
            o.raw("zone", zone()->layoutJson());
            return finish(o);
        }
        if (debugRoutes && route == "/debug") {            // testing only: jump around, hand out keystones
            string zid = reqStr(body, "zone", player->zoneId);
            world->get(zid);
            player->zoneId = zid;
            player->setPos(Position(reqInt(body, "x", zone()->getStart().x), reqInt(body, "y", zone()->getStart().y)));
            for (int i = player->keystoneCount(); i < reqInt(body, "keys", 0); i++) player->addKeystone(Items::Keystone(i + 1, "Keystone"));
            if (reqInt(body, "boss", 0)) player->setFlag("boss_down");
            if (reqInt(body, "slugs", 0)) { player->addSlug(new IceSlug(5)); player->addSlug(new EarthSlug(5)); player->addSlug(new AirSlug(5)); }
            for (int i = 1; i <= reqInt(body, "cards", 0); i++) player->cardsShown.insert(i);
            if (reqInt(body, "starter", 0)) { player->setFlag("starter"); if (player->allSlugs().empty()) player->addSlug(new FireSlug(2)); }
            if (reqInt(body, "seen", 0)) player->setFlag("seen_wild");
            if (reqInt(body, "unseen", 0)) player->clearFlag("seen_wild");
            return finish(o);
        }
        if (route == "/move") return doMove(body);
        if (route == "/interact") return doInteract();
        if (route == "/slugs") {
            if (player->allSlugs().size() > 0) unlock(4);
            return finish(o);
        }
        if (route == "/slugpedia") {
            unlock(3);
            o.raw("entries", player->pedia.toJson());
            return finish(o);
        }
        if (route == "/loadout") return doLoadout(body);
        if (route == "/release") return doRelease(body);
        if (route == "/fuse") return doFuse(body);
        if (route == "/trade") return doTrade(body);
        if (route == "/moss") return doMoss();
        if (route == "/inspect") return doInspect(query);
        if (route == "/save") return doSave();
        if (route == "/load") return doLoad();
        if (route == "/fire" || route == "/swap" || route == "/guard" || route == "/run" || route == "/enemyturn") {
            if (!battle) throw InvalidMoveException("There is no duel right now");
            string act;
            if (route == "/fire") { act = battle->fire(); unlock(5); }
            else if (route == "/swap") act = battle->swap();
            else if (route == "/guard") act = battle->guard();
            else if (route == "/run") act = battle->run();
            else act = battle->enemyTurn();
            if ((route == "/fire" || route == "/enemyturn") &&
                (act.find("\"label\":\"super\"") != string::npos || act.find("\"label\":\"resisted\"") != string::npos))
                unlock(6);
            o.raw("action", act);
            return afterBattleAction(o);
        }
        throw GameException("Unknown route " + route);
    } catch (GateLockedException& e) {                   // specific catch first
        Logger::log("catch", "main loop caught GateLockedException: " + string(e.what()));
        unlock(8);
        JsonObj o;
        o.add("locked", true).add("msg", e.what());
        JsonObj err;
        err.add("kind", e.kind()).add("msg", e.what());
        o.raw("error", err.str());
        return finish(o, false);
    } catch (GameException& e) {                         // then the base class
        Logger::log("catch", "main loop caught " + e.kind() + ": " + string(e.what()));
        JsonObj o;
        JsonObj err;
        err.add("kind", e.kind()).add("msg", e.what());
        o.raw("error", err.str());
        return finish(o, false);
    } catch (exception& e) {
        JsonObj o;
        JsonObj err;
        err.add("kind", "exception").add("msg", e.what());
        o.raw("error", err.str());
        return finish(o, false);
    }
}

}  // namespace Game
