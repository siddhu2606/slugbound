#include "enemy.h"

namespace Game {
namespace Combat {

// ---------- DamageCalculator ----------
int DamageCalculator::calcCount = 0;

float DamageCalculator::multiplier(Element attacker, Element defender) {
    if (attacker == GHOUL || defender == GHOUL) return 1.0f;
    if (beats(attacker) == defender) return 2.0f;      // super effective
    if (beats(defender) == attacker) return 0.5f;      // resisted
    return 1.0f;
}

int DamageCalculator::slugDamage(const Slug& s, const Enemy& e, float& mult) {
    calcCount++;
    mult = multiplier(s.element, e.element);           // private members: that is why we are a friend
    return (int)((s.power * 2 + s.level) * mult);
}

int DamageCalculator::enemyDamage(const Enemy& e, const Slug& s, float& mult) {
    calcCount++;
    mult = multiplier(e.element, s.element);
    float d = (e.power * 2 + e.level) * mult;
    if (e.slow > 0) d *= 0.7f;
    return (int)d;
}

OOPCard DamageCalculator::describeOOP() {
    OOPCard c;
    c.title = "ELEMENT WHEEL";
    c.badge = "Fire > Ice > Air > Earth > Energy > Fire";
    c.classLine = "class DamageCalculator  (friend of Slug and Enemy)";
    c.inherits = "nothing - a helper class";
    c.data = "static int calcCount = " + to_string(calcCount);
    c.funcs.push_back("static multiplier(Element, Element)  -> 2.0 / 1.0 / 0.5");
    c.funcs.push_back("static slugDamage(const Slug&, const Enemy&)");
    c.funcs.push_back("static enemyDamage(const Enemy&, const Slug&)");
    c.oop.push_back("FRIEND CLASS: reads the PRIVATE element and power of Slug and Enemy");
    c.oop.push_back("STATIC MEMBER: calcCount is shared by every call, not owned by an object");
    c.viva = "A friend class may read private members. One trusted class gets access, instead of public getters for everything.";
    return c;
}

// ---------- Enemy ----------
Enemy::Enemy(const string& n, Element e, int lvl, int hpValue, int powerValue, const string& k)
    : Entity(n, hpValue), Combatant(powerValue), element(e), power(powerValue), level(lvl),
      kind(k), burn(0), slow(0), stunned(false) {
    Logger::log("ctor", "Enemy('" + n + "', " + elementName(e) + ", " + k + ") built");
}

Enemy::~Enemy() {
    Logger::log("dtor", "Enemy('" + name + "') destroyed");
}

int Enemy::takeHit(int dmg) {
    return takeDamage(dmg);
}

int Enemy::tickStatus() {
    int dmg = 0;
    if (burn > 0) {
        burn--;
        dmg = takeDamage(4 + level);
    }
    return dmg;
}

EnemyMove Enemy::takeTurn(Slug& target) {
    EnemyMove m;
    if (stunned) {
        stunned = false;
        m.kind = "stunned";
        m.text = name + " is stunned and cannot move!";
        return m;
    }
    m.kind = "attack";
    m.dmgSlug = DamageCalculator::enemyDamage(*this, target, m.mult);
    m.label = m.mult > 1.0f ? "super" : (m.mult < 1.0f ? "resisted" : "normal");
    if (slow > 0) slow--;
    m.text = name + " attacks " + target.getName() + "!";
    return m;
}

string Enemy::toJson() const {
    JsonObj o;
    o.add("name", name).add("element", elementName(element)).add("level", level);
    o.add("hp", hp).add("maxHp", maxHp).add("kind", kind).add("cls", "Enemy");
    o.add("burn", burn).add("slow", slow).add("stunned", stunned);
    o.add("phase", 0).add("minions", 0).add("warning", false);
    return o.str();
}

OOPCard Enemy::describeOOP() const {
    OOPCard c;
    c.title = name;
    c.badge = elementName(element) + " " + kind;
    c.classLine = "class Enemy : public Combatant";
    c.inherits = "Combatant -> Entity (virtual base)";
    c.data = "element (private), power (private), level, kind, burn, slow, stunned";
    c.funcs.push_back("virtual takeTurn(Slug&)  <- BossEnemy overrides it");
    c.funcs.push_back("virtual takeHit(int)     <- boss minions absorb here");
    c.funcs.push_back("virtual ~Enemy()  <- prints [dtor] when the duel ends");
    c.oop.push_back("MULTILEVEL INHERITANCE: Entity -> Combatant -> Enemy -> BossEnemy");
    c.oop.push_back("DESTRUCTOR: the Battle deletes this object when the duel is over");
    c.viva = "A virtual destructor makes delete through a base pointer run the derived destructor first.";
    return c;
}

// ---------- BossEnemy ----------
BossEnemy::BossEnemy(const string& n, int lvl, int hpValue, int powerValue)
    : Entity(n, hpValue), Enemy(n, ICE, lvl, hpValue, powerValue, "boss"),
      phase(1), turnCount(0), shieldTurns(0), summoned(false) {
    Logger::log("ctor", "BossEnemy('" + n + "') built (most derived class builds the virtual base)");
}

BossEnemy::~BossEnemy() {
    Logger::log("dtor", "BossEnemy('" + name + "') destroyed");
    while (!minions.empty()) {
        delete minions.top();                            // virtual destructor in action
        minions.pop();
    }
}

void BossEnemy::summonMinions() {
    for (int i = 0; i < 3; i++)
        minions.push(new Enemy("Ghoul Minion", GHOUL, getLevel(), 20, 4, "minion"));
}

int BossEnemy::takeHit(int dmg) {
    if (!minions.empty()) {                              // LIFO: top minion takes the hit and is removed
        Enemy* top = minions.top();
        minions.pop();
        delete top;
        return -1;                                       // -1 means "absorbed"
    }
    return takeDamage(dmg);
}

string BossEnemy::onDamaged() {
    int pct = hp * 100 / maxHp;
    if (phase == 1 && pct < 66) {
        phase = 2;
        if (!summoned) {
            summoned = true;
            summonMinions();
        }
        return "PHASE 2: Gorvax calls a stack of Ghoul minions! The top minion absorbs each hit.";
    }
    if (phase == 2 && pct < 33) {
        phase = 3;
        return "PHASE 3: Gorvax's eyes burn red. Guard when you see the warning!";
    }
    return "";
}

EnemyMove BossEnemy::takeTurn(Slug& target) {
    EnemyMove m;
    if (stunned) {
        stunned = false;
        m.kind = "stunned";
        m.text = "Gorvax shudders, stunned!";
        return m;
    }
    turnCount++;
    if (phase == 3) {
        int step = turnCount % 3;
        if (step == 1) {                                 // attack
            m.kind = "attack";
            m.dmgSlug = DamageCalculator::enemyDamage(*this, target, m.mult);
            m.text = "Gorvax slashes " + target.getName() + "!";
        } else if (step == 2) {                          // warning
            m.kind = "warning";
            m.text = "Gorvax rears back... a red glow fills the Keep! GUARD!";
        } else {                                         // mega attack
            m.kind = "mega";
            m.dmgSlinger = 50;
            m.text = "GORVAX UNLEASHES THE HOLLOW BLAST!";
        }
    } else {
        m.kind = "attack";
        m.dmgSlug = DamageCalculator::enemyDamage(*this, target, m.mult);
        m.text = "Gorvax strikes " + target.getName() + "!";
        shieldTurns++;
        if (phase == 1 && shieldTurns >= 2) {            // phase 1: shield element changes every 2 turns
            shieldTurns = 0;
            static const Element cycle[] = {ICE, AIR, EARTH, ENERGY, FIRE};
            int idx = 0;
            for (int i = 0; i < 5; i++)
                if (cycle[i] == getElement()) idx = i;
            setElement(cycle[(idx + 1) % 5]);
            m.kind = "shift";
            m.text += " His shield shifts to " + elementName(getElement()) + "!";
        }
    }
    m.label = m.mult > 1.0f ? "super" : (m.mult < 1.0f ? "resisted" : "normal");
    if (slow > 0) slow--;
    return m;
}

string BossEnemy::toJson() const {
    JsonObj o;
    o.add("name", name).add("element", elementName(getElement())).add("level", getLevel());
    o.add("hp", hp).add("maxHp", maxHp).add("kind", kind).add("cls", "BossEnemy");
    o.add("burn", burn).add("slow", slow).add("stunned", stunned);
    o.add("phase", phase).add("minions", (int)minions.size());
    bool warn = (phase == 3 && turnCount % 3 == 2);
    o.add("warning", warn);
    return o.str();
}

OOPCard BossEnemy::describeOOP() const {
    OOPCard c;
    c.title = "GORVAX THE HOLLOW KING";
    c.badge = "Boss - phase " + to_string(phase);
    c.classLine = "class BossEnemy : public Enemy";
    c.inherits = "Enemy -> Combatant -> Entity (virtual base)";
    c.data = "phase, turnCount, stack<Enemy*> minions";
    c.funcs.push_back("takeTurn()  <- overrides Enemy::takeTurn per phase");
    c.funcs.push_back("takeHit()   <- the top minion absorbs the hit");
    c.oop.push_back("POLYMORPHISM: Battle calls enemy->takeTurn() and gets boss behaviour");
    c.oop.push_back("STL stack: minions are LIFO, last summoned absorbs first");
    c.viva = "Why stack for minions? Last summoned is first to absorb a hit - that is LIFO.";
    return c;
}

}  // namespace Combat
}  // namespace Game
