#include "entities.h"

namespace Game {

// ---------- Entity ----------
Entity::Entity() : name("Unknown"), hp(1), maxHp(1), pos() {
    Logger::log("ctor", "Entity('Unknown') default constructor");
}

Entity::Entity(const string& n, int h, Position p) : name(n), hp(h), maxHp(h), pos(p) {
    Logger::log("ctor", "Entity('" + n + "') built FIRST (virtual base)");
}

Entity::~Entity() {
    Logger::log("dtor", "Entity('" + name + "') destroyed LAST");
}

int Entity::takeDamage(int d) {
    if (d < 0) d = 0;
    int before = hp;
    hp = clampValue(hp - d, 0, maxHp);
    return before - hp;
}

void Entity::recover(int amount) { hp = clampValue(hp + amount, 0, maxHp); }

OOPCard Entity::describeOOP() const {
    OOPCard c;
    c.title = name;
    c.badge = "Entity";
    c.classLine = "class Entity  (virtual base class)";
    c.inherits = "nothing - it is the root";
    c.data = "name, hp, maxHp, pos";
    c.funcs.push_back("takeDamage()  <- clamps hp at 0");
    c.funcs.push_back("virtual ~Entity()  <- runs last");
    c.oop.push_back("VIRTUAL BASE: Combatant and Explorer share ONE Entity");
    return c;
}

// ---------- Combatant ----------
Combatant::Combatant() : guarding(false), strikePower(3) {
    Logger::log("ctor", "Combatant built (Entity part already exists)");
}

Combatant::Combatant(int power) : guarding(false), strikePower(power) {
    Logger::log("ctor", "Combatant(power=" + to_string(power) + ") built");
}

Combatant::~Combatant() {
    Logger::log("dtor", "Combatant destroyed");
}

int Combatant::attack(Combatant& target) {
    return target.takeDamage(strikePower);
}

int Combatant::attack(Combatant& target, int boost) {
    return target.takeDamage(strikePower + boost);
}

int Combatant::absorb(int dmg) {
    if (guarding) {
        guarding = false;
        return dmg / 2;
    }
    return dmg;
}

// ---------- Explorer ----------
Explorer::Explorer() : facing(DOWN) {
    Logger::log("ctor", "Explorer built (Entity part already exists)");
}

Explorer::~Explorer() {
    Logger::log("dtor", "Explorer destroyed");
}

int Explorer::itemCount(const string& n) const {
    for (int i = 0; i < items.size(); i++)
        if (items[i].name == n) return items[i].count;
    return 0;
}

void Explorer::addItem(const string& n, int count) {
    for (int i = 0; i < items.size(); i++)
        if (items[i].name == n) {
            items[i].count += count;
            return;
        }
    items.add(Items::Item(n, count));
}

bool Explorer::useItem(const string& n) {
    for (int i = 0; i < items.size(); i++)
        if (items[i].name == n && items[i].count > 0) {
            items[i].count--;
            return true;
        }
    return false;
}

}  // namespace Game
