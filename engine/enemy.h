// enemy.h - Enemy (Combatant -> Enemy -> BossEnemy, multilevel inheritance).
#pragma once
#include "entities.h"
#include "slugs.h"

namespace Game {
namespace Combat {

// What an enemy decided to do this turn.
struct EnemyMove {
    string kind;          // attack, stunned, summon, warning, mega, shift
    int dmgSlug;          // damage aimed at the front slug
    int dmgSlinger;       // damage aimed at the Slinger (boss mega attack)
    float mult;
    string label;
    string text;
    EnemyMove() : kind("attack"), dmgSlug(0), dmgSlinger(0), mult(1.0f), label("normal"), text("") {}
};

class Enemy : public Combatant {
    friend class DamageCalculator;                       // reads private element/power/level
private:
    Element element;
    int power;
    int level;
protected:
    string kind;                                         // wild, ghoul, rival, boss, minion
    int burn;                                            // turns of burning left
    int slow;                                            // turns of slow left
    bool stunned;
public:
    Enemy(const string& n, Element e, int lvl, int hpValue, int powerValue, const string& k);
    virtual ~Enemy();

    Element getElement() const { return element; }
    void setElement(Element e) { element = e; }
    int getLevel() const { return level; }
    string getKind() const { return kind; }
    bool isSlowed() const { return slow > 0; }
    void setBurn(int turns) { burn = turns; }
    void setSlow(int turns) { slow = turns; }
    void setStunned(bool s) { stunned = s; }

    virtual int takeHit(int dmg);                        // a slug hit lands here (virtual: boss minions absorb)
    virtual EnemyMove takeTurn(Slug& target);            // overridden by BossEnemy per phase
    virtual string onDamaged() { return ""; }            // boss phase changes
    int tickStatus();                                    // burn damage at the start of its turn
    virtual string toJson() const;
    OOPCard describeOOP() const override;
};

class BossEnemy : public Enemy {
    int phase;
    int turnCount;
    int shieldTurns;
    bool summoned;
    stack<Enemy*> minions;                               // LIFO: the top minion absorbs the next hit
public:
    BossEnemy(const string& n, int lvl, int hpValue, int powerValue);
    ~BossEnemy();

    int getPhase() const { return phase; }
    int minionCount() const { return (int)minions.size(); }
    int takeHit(int dmg) override;
    EnemyMove takeTurn(Slug& target) override;
    string onDamaged() override;
    string toJson() const override;
    OOPCard describeOOP() const override;
private:
    void summonMinions();
};

}  // namespace Combat
}  // namespace Game
