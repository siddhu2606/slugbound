// slugs.h - the Slug hierarchy, DamageCalculator, Blaster and Slugpedia.
#pragma once
#include "common.h"
#include "templates.h"

namespace Game {
namespace Combat {

class Enemy;
class DamageCalculator;

// What one attack did.  The Battle reads it to tell the browser what to animate.
struct HitResult {
    int damage;
    float mult;
    string label;          // "normal", "super", "resisted"
    string effect;         // "burn", "slow", "stun", "shield", ...
    int shield;
    int hits;
    bool absorbed;         // a minion soaked the hit
    HitResult() { reset(); }
    void reset() { damage = 0; mult = 1.0f; label = "normal"; effect = ""; shield = 0; hits = 0; absorbed = false; }
};

// ---------- Slug: ABSTRACT.  attack(), morph(), special(), clone() are pure virtual ----------
class Slug {
    friend class DamageCalculator;                       // reads the private element and power
    friend ostream& operator<<(ostream& out, const Slug& s);
    friend istream& operator>>(istream& in, Slug& s);
private:
    Element element;
    int power;
protected:
    int uid;
    string name;
    int hp, maxHp, level, xp;
    static int totalSlugs;
    static int nextUid;
public:
    HitResult lastHit;

    Slug(const string& n, Element e, int lvl, int baseHp, int basePower);
    Slug(const Slug& other);                             // copy constructor (used by clone())
    virtual ~Slug();                                     // virtual: ~FireSlug runs first

    int getUid() const { return uid; }
    string getName() const { return name; }
    Element getElement() const { return element; }
    int getHp() const { return hp; }
    int getMaxHp() const { return maxHp; }
    int getLevel() const { return level; }
    int getXp() const { return xp; }
    int xpNeeded() const { return 18 + 8 * level; }
    bool isAlive() const { return hp > 0; }
    static int getTotalSlugs() { return totalSlugs; }

    int takeDamage(int d);
    void healBy(int amount);
    void fullHeal() { hp = maxHp; }

    virtual int attack(Enemy& e) = 0;                    // pure virtual
    int attack(Enemy& e, int boost);                     // overload: one hit with a flat bonus
    virtual string morph() const = 0;                    // which morph animation the browser plays
    virtual void special(Enemy& e) = 0;                  // burn, slow, stun...
    virtual string ability() const = 0;                  // what it does outside battle
    virtual Slug* clone() const = 0;                     // virtual copy
    virtual string className() const = 0;
    virtual OOPCard describeOOP() const = 0;

    virtual void save(ofstream& out) const;
    virtual void load(ifstream& in);
    static Slug* fromFile(ifstream& in);                 // reads a type tag, builds the right subclass

    // operators
    Slug* operator+(const Slug& other) const;            // FUSION: returns a new GhoulSlug
    bool operator>(const Slug& other) const { return power > other.power; }
    bool operator==(const Slug& other) const { return name == other.name && level == other.level; }
    Slug& operator++();                                  // level up
    Slug& operator+=(int gainedXp);                      // gain XP, may level up
    int levelsGainedLast;

    string toJson() const;
};

ostream& operator<<(ostream& out, const Slug& s);
istream& operator>>(istream& in, Slug& s);

// ---------- The six species ----------
class FireSlug : public Slug {
public:
    FireSlug(int lvl = 1);
    ~FireSlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "inferno"; }
    void special(Enemy& e) override;
    string ability() const override { return "none"; }
    Slug* clone() const override;
    string className() const override { return "FireSlug"; }
    OOPCard describeOOP() const override;
};

class IceSlug : public Slug {
public:
    IceSlug(int lvl = 1);
    ~IceSlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "glacier"; }
    void special(Enemy& e) override;
    string ability() const override { return "freeze"; }
    Slug* clone() const override;
    string className() const override { return "IceSlug"; }
    OOPCard describeOOP() const override;
};

class EarthSlug : public Slug {
public:
    EarthSlug(int lvl = 1);
    ~EarthSlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "boulder"; }
    void special(Enemy& e) override;
    string ability() const override { return "smash"; }
    Slug* clone() const override;
    string className() const override { return "EarthSlug"; }
    OOPCard describeOOP() const override;
};

class AirSlug : public Slug {
public:
    AirSlug(int lvl = 1);
    ~AirSlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "gale"; }
    void special(Enemy& e) override;
    string ability() const override { return "glide"; }
    Slug* clone() const override;
    string className() const override { return "AirSlug"; }
    OOPCard describeOOP() const override;
};

class EnergySlug : public Slug {
public:
    EnergySlug(int lvl = 1);
    ~EnergySlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "storm"; }
    void special(Enemy& e) override;
    string ability() const override { return "power"; }
    Slug* clone() const override;
    string className() const override { return "EnergySlug"; }
    OOPCard describeOOP() const override;
};

// Only made by fusion (Slug + Slug) or by loading a save.
class GhoulSlug : public Slug {
public:
    GhoulSlug(int lvl = 1);
    GhoulSlug(int lvl, int totalHp, int totalPower);   // used by operator+ (fusion)
    ~GhoulSlug();
    using Slug::attack;
    int attack(Enemy& e) override;
    string morph() const override { return "umbra"; }
    void special(Enemy& e) override;
    string ability() const override { return "none"; }
    Slug* clone() const override;
    string className() const override { return "GhoulSlug"; }
    OOPCard describeOOP() const override;
};

Slug* makeSlug(Element e, int level);                    // small factory

// ---------- DamageCalculator: friend of Slug and Enemy ----------
class DamageCalculator {
    static int calcCount;                                // static member
public:
    static float multiplier(Element attacker, Element defender);
    static int slugDamage(const Slug& s, const Enemy& e, float& mult);
    static int enemyDamage(const Enemy& e, const Slug& s, float& mult);
    static int getCalcCount() { return calcCount; }
    static OOPCard describeOOP();
};

// ---------- Blaster: queue<Slug*>, owns its slugs, deep copy through clone() ----------
class Blaster {
    queue<Slug*> chamber;
public:
    static const int CAPACITY = 4;
    Blaster();
    Blaster(const Blaster& other);                       // deep copy constructor
    Blaster& operator=(const Blaster& other);
    ~Blaster();

    int size() const { return (int)chamber.size(); }
    bool full() const { return size() >= CAPACITY; }
    void add(Slug* s);
    Slug* front() const;
    Slug* fire();                                        // front slug goes to the back
    void swap();                                         // rotate the queue
    bool remove(Slug* s);                                // take out WITHOUT deleting
    vector<Slug*> contents() const;                      // front ... back
    bool hasAliveElement(Element e) const;
    vector<Slug*> releaseAll();                          // give up ownership
    void destroyAll();
    void save(ofstream& out) const;
    void load(ifstream& in);
    OOPCard describeOOP() const;
};

// ---------- Slugpedia: map<string, Slug*> and set<string> ----------
class Slugpedia {
    map<string, Slug*> entries;
    map<string, string> blurbs;
    set<string> found;
public:
    Slugpedia();
    ~Slugpedia();
    void load(istream& in);                              // reads text lines with operator>>
    void loadDefault();                                  // slugpedia.txt if it exists, else the built-in text
    void discover(const string& name);
    bool isFound(const string& name) const { return found.count(name) > 0; }
    const set<string>& foundSet() const { return found; }
    void setFound(const set<string>& f) { found = f; }
    string toJson() const;
    OOPCard cardFor(const string& name) const;
    OOPCard describeOOP() const;
};

}  // namespace Combat
}  // namespace Game
