// entities.h - Entity (virtual base), Combatant, Explorer.  Slinger is in slinger.h.
#pragma once
#include "common.h"
#include "templates.h"

namespace Game {

namespace Items {
struct Item {
    string name;
    int count;
    Item(string n = "", int c = 0) : name(n), count(c) {}
};
struct Keystone {
    int id;
    string name;
    Keystone(int i = 0, string n = "") : id(i), name(n) {}
};
}  // namespace Items

namespace World { class Interactable; struct Outcome; }

// The shared base of the diamond.  Combatant and Explorer inherit it VIRTUALLY.
class Entity {
protected:
    string name;
    int hp;
    int maxHp;
    Position pos;
public:
    Entity();
    Entity(const string& n, int h, Position p = Position());
    virtual ~Entity();

    string getName() const { return name; }
    int getHp() const { return hp; }
    int getMaxHp() const { return maxHp; }
    Position getPos() const { return pos; }
    void setPos(Position p) { pos = p; }
    bool isAlive() const { return hp > 0; }

    int takeDamage(int d);        // returns the damage really taken
    void recover(int amount);
    void setHp(int h) { hp = clampValue(h, 0, maxHp); }

    virtual OOPCard describeOOP() const;
};

// Can fight: attack() and guard().
class Combatant : virtual public Entity {
protected:
    bool guarding;
    int strikePower;
public:
    Combatant();
    Combatant(int power);
    virtual ~Combatant();

    virtual int attack(Combatant& target);               // plain strike
    int attack(Combatant& target, int boost);            // overload: strike with a bonus
    void guard() { guarding = true; }
    void clearGuard() { guarding = false; }
    bool isGuarding() const { return guarding; }
    int absorb(int dmg);                                 // halves damage once if guarding
};

// Can walk, talk and carry things.
class Explorer : virtual public Entity {
protected:
    Direction facing;
    Inventory<Items::Item> items;
    Inventory<Items::Keystone> keystones;
public:
    Explorer();
    virtual ~Explorer();

    Direction getFacing() const { return facing; }
    void face(Direction d) { facing = d; }
    Position ahead() const { return stepFrom(pos, facing); }
    void moveTo(Position p) { pos = p; }

    int itemCount(const string& name) const;
    void addItem(const string& name, int n);
    bool useItem(const string& name);
    int keystoneCount() const { return keystones.size(); }
    void addKeystone(const Items::Keystone& k) { keystones.add(k); }

    World::Outcome interact(World::Interactable& obj);   // defined in world.cpp
};

}  // namespace Game
