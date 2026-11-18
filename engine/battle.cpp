#include "battle.h"

namespace Game {
namespace Combat {

int Battle::battleCount = 0;

Battle::Battle(Slinger& p, Enemy* e, const string& source)
    : player(p), enemy(e), backup(p.blaster), over(false), shield(0), sourceId(source),
      xpGained(0), ammoGained(0), mossGained(0), anyFaint(false) {
    battleCount++;
    player.setFlag("seen_wild");
    turnOrder.push(&player);                    // Slinger* -> Combatant*  (upcast)
    turnOrder.push(enemy);
    note("Battle #" + to_string(battleCount) + " begins: " + player.getName() + " vs " + enemy->getName());
    Logger::log("ctor", "Battle #" + to_string(battleCount) + " built (static Battle::battleCount)");
}

Battle::~Battle() {
    delete enemy;                               // virtual destructor: ~BossEnemy / ~Enemy
    ofstream f("battle_log.txt", ios::app);
    if (f) {
        for (list<string>::iterator it = battleLog.begin(); it != battleLog.end(); ++it) f << *it << "\n";
    }
    Logger::log("dtor", "Battle destroyed (its backup Blaster is destroyed too)");
}

void Battle::note(const string& line) { battleLog.push_back(line); }

void Battle::requirePlayerTurn() const {
    if (over) throw InvalidMoveException("The duel is over");
    if (turnOrder.front() != &player) throw InvalidMoveException("It is not your turn");
}

void Battle::requireEnemyTurn() const {
    if (over) throw InvalidMoveException("The duel is over");
    if (turnOrder.front() != enemy) throw InvalidMoveException("It is your turn");
}

void Battle::nextTurn() {
    Combatant* c = turnOrder.front();
    turnOrder.pop();
    turnOrder.push(c);
}

// ---------- player actions ----------
string Battle::fire() {
    requirePlayerTurn();
    if (player.blaster.size() == 0) throw InvalidMoveException("There are no slugs in the blaster");
    player.useAmmo();                           // throws OutOfAmmoException: the turn is NOT used
    Slug* s = player.blaster.fire();            // the front slug flies out and re-queues at the back
    fought.insert(s->getUid());
    Logger::log("call", "Slug* -> attack()  =>  " + s->className() + "::attack()");
    int dmg = s->attack(*enemy);                // virtual dispatch: the Battle never asks "which element?"
    HitResult h = s->lastHit;
    shield += h.shield;
    string phaseMsg;
    if (enemy->isAlive()) phaseMsg = enemy->onDamaged();
    note(s->getName() + " hit " + enemy->getName() + " for " + to_string(dmg) + " (" + h.label + ")");

    JsonObj a;
    a.add("type", "fire").raw("slug", s->toJson());
    a.add("damage", dmg).add("hits", h.hits).add("mult", (double)h.mult).add("label", h.label);
    a.add("effect", h.effect).add("shieldGain", h.shield).add("absorbed", h.absorbed);
    a.add("phaseMsg", phaseMsg).add("killed", !enemy->isAlive());
    nextTurn();
    if (!enemy->isAlive()) win();
    return a.str();
}

string Battle::swap() {
    requirePlayerTurn();
    if (player.blaster.size() < 2) throw InvalidMoveException("There is nothing to swap with");
    player.blaster.swap();
    note("Swapped the queue");
    nextTurn();
    JsonObj a;
    a.add("type", "swap");
    return a.str();
}

string Battle::guard() {
    requirePlayerTurn();
    player.guard();
    note("Guarding");
    nextTurn();
    JsonObj a;
    a.add("type", "guard");
    return a.str();
}

string Battle::moss() {
    requirePlayerTurn();
    if (!player.useItem("Healing Moss")) throw GameException("No Healing Moss left");
    Slug* f = player.blaster.front();
    int healed = 0;
    if (f) {
        int before = f->getHp();
        f->healBy(40);
        healed = f->getHp() - before;
    }
    player.heal(20);
    note("Healing Moss used");
    nextTurn();
    JsonObj a;
    a.add("type", "moss").add("healed", healed);
    return a.str();
}

string Battle::run() {
    requirePlayerTurn();
    if (enemy->getKind() != "wild") throw InvalidMoveException("You cannot run from this duel!");
    JsonObj a;
    a.add("type", "run");
    if (rand() % 100 < 70) {
        over = true;
        result = "run";
        player.clearGuard();
        a.add("escaped", true);
        note("Escaped");
    } else {
        a.add("escaped", false);
        nextTurn();
    }
    return a.str();
}

// ---------- enemy turn ----------
string Battle::enemyTurn() {
    requireEnemyTurn();
    JsonObj a;
    a.add("type", "enemy");
    int burnDmg = enemy->tickStatus();
    a.add("burn", burnDmg);
    if (burnDmg > 0) note(enemy->getName() + " burns for " + to_string(burnDmg));
    if (!enemy->isAlive()) {
        nextTurn();
        win();
        a.add("kind", "burned").add("text", enemy->getName() + " burns away!").add("killed", true);
        return a.str();
    }
    Slug* target = player.blaster.front();
    if (!target) {
        lose();
        a.add("kind", "none").add("text", "No slugs left!").add("killed", false);
        return a.str();
    }
    EnemyMove mv = enemy->takeTurn(*target);    // virtual: BossEnemy decides per phase
    Logger::log("call", "Enemy* -> takeTurn()  =>  " + enemy->getName() + "'s takeTurn() chose '" + mv.kind + "'");
    int toSlug = mv.dmgSlug;
    int toSlinger = mv.dmgSlinger;
    bool guarded = false;
    int shieldAbsorbed = 0;
    if (toSlug > 0) {
        if (player.isGuarding()) {
            toSlug = player.absorb(toSlug);
            guarded = true;
        }
        if (shield > 0) {
            shieldAbsorbed = min(shield, toSlug);
            shield -= shieldAbsorbed;
            toSlug -= shieldAbsorbed;
        }
    }
    int dealtSlug = (mv.dmgSlug > 0) ? target->takeDamage(toSlug) : 0;
    int dealtSlinger = 0;
    if (toSlinger > 0) {
        if (player.isGuarding()) {
            toSlinger = player.absorb(toSlinger);
            guarded = true;
        }
        dealtSlinger = player.takeDamage(toSlinger);
    }
    bool fainted = false;
    string faintedName;
    if (mv.dmgSlug > 0 && !target->isAlive()) {
        fainted = true;
        faintedName = target->getName();
        faint(target);
    }
    note(mv.text);
    a.add("kind", mv.kind).add("text", mv.text).add("label", mv.label).add("mult", (double)mv.mult);
    a.add("dmgSlug", dealtSlug).add("dmgSlinger", dealtSlinger).add("guarded", guarded);
    a.add("shieldAbsorbed", shieldAbsorbed).add("fainted", fainted).add("faintedName", faintedName);
    a.add("targetId", target->getUid()).add("targetName", target->getName());
    a.add("killed", false);
    nextTurn();
    if (player.getHp() <= 0 || player.blaster.size() == 0) lose();
    return a.str();
}

// ---------- ending ----------
void Battle::faint(Slug* s) {
    anyFaint = true;
    player.setFlag("fainted");
    player.blaster.remove(s);
    player.storage.add(s);                      // it rests in storage until healed
    note(s->getName() + " fainted");
    Logger::log("faint", s->getName() + " (" + s->className() + ") fainted and leaves the blaster");
}

void Battle::win() {
    over = true;
    result = "win";
    player.clearGuard();
    xpGained = enemy->getLevel() * 14 + (enemy->getKind() == "boss" ? 200 : 0);
    vector<Slug*> team = player.blaster.contents();
    for (size_t i = 0; i < team.size(); i++) {
        if (!team[i]->isAlive()) continue;
        *team[i] += fought.count(team[i]->getUid()) ? xpGained : xpGained / 2;   // operator+=
        for (int k = 0; k < team[i]->levelsGainedLast; k++)
            levelUps.push_back(team[i]->getName() + " reached level " + to_string(team[i]->getLevel() - team[i]->levelsGainedLast + k + 1) + "!");
    }
    string kind = enemy->getKind();
    ammoGained = (kind == "rival") ? 5 : (kind == "boss" ? 0 : 3);
    if (ammoGained) player.addAmmo(ammoGained);
    if (kind == "rival" || kind == "ghoul") {
        mossGained = 1;
        player.addItem("Healing Moss", 1);
    }
    if (kind == "wild") {
        Slug* caught = makeSlug(enemy->getElement(), enemy->getLevel());
        caughtJson = caught->toJson();
        player.addSlug(caught);
        note("Caught a " + caught->getName());
    }
    note("Victory! +" + to_string(xpGained) + " XP");
}

void Battle::lose() {
    over = true;
    result = "lose";
    player.clearGuard();
    // slugs that fainted in this duel are in storage: delete them, then restore the snapshot
    vector<Slug*> saved = backup.contents();
    for (int i = player.storage.size() - 1; i >= 0; i--) {
        for (size_t j = 0; j < saved.size(); j++)
            if (saved[j]->getUid() == player.storage[i]->getUid()) {
                delete player.storage[i];
                player.storage.removeAt(i);
                break;
            }
    }
    player.blaster = backup;                    // Blaster::operator= (deep copy)
    player.healEverything();
    note("Blacked out. The blaster was restored from the snapshot");
}

string Battle::stateJson() const {
    JsonObj o;
    o.raw("enemy", enemy->toJson());
    Slug* f = player.blaster.front();
    o.raw("front", f ? f->toJson() : "null");
    vector<string> q;
    vector<Slug*> v = player.blaster.contents();
    for (size_t i = 0; i < v.size(); i++) q.push_back(v[i]->toJson());
    o.raw("queue", jarr(q));
    o.add("ammo", player.ammo).add("moss", player.itemCount("Healing Moss"));
    o.add("slingerHp", player.getHp()).add("slingerMax", player.getMaxHp());
    o.add("guard", player.isGuarding()).add("shield", shield);
    o.add("turn", (!over && turnOrder.front() == &player) ? "player" : "enemy");
    o.add("over", over).add("result", result).add("source", sourceId).add("kind", enemy->getKind());
    o.add("xp", xpGained).add("ammoGained", ammoGained).add("mossGained", mossGained);
    o.raw("levelUps", jstrs(levelUps));
    o.raw("caught", caughtJson.empty() ? "null" : caughtJson);
    o.add("battleCount", battleCount);
    return o.str();
}

OOPCard Battle::describeOOP() {
    OOPCard c;
    c.title = "THE DUEL";
    c.badge = "Polymorphism";
    c.classLine = "class Battle";
    c.inherits = "nothing - it USES Slug*, Enemy* and Blaster";
    c.data = "queue<Combatant*> turnOrder, list<string> battleLog, static int battleCount";
    c.funcs.push_back("fire()  <- calls slug->attack(enemy) through a Slug*");
    c.funcs.push_back("attack(Enemy&) and attack(Enemy&, int boost)  <- OVERLOADED");
    c.funcs.push_back("enemyTurn()  <- calls enemy->takeTurn() through an Enemy*");
    c.oop.push_back("POLYMORPHISM: fire a Pyrolisk and a Frostmaw through the same Slug* line");
    c.oop.push_back("VIRTUAL DISPATCH: the vtable picks FireSlug::attack at runtime");
    c.oop.push_back("OVERLOADING: attack(e) and attack(e, boost) share a name, differ in parameters");
    c.oop.push_back("STL queue + list: turn order is FIFO, the log is cheap appends");
    c.viva = "Each polymorphic object has a hidden pointer to its class's vtable. The call slug->attack() looks up the right function at runtime.";
    return c;
}

}  // namespace Combat
}  // namespace Game
