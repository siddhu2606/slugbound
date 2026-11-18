// battle.h - the turn-based duel.  The Battle owns the enemy and works on a deep-copied backup of the blaster.
#pragma once
#include "slinger.h"
#include "enemy.h"

namespace Game {
namespace Combat {

class Battle {
    Slinger& player;
    Enemy* enemy;                               // owned: deleted when the duel ends
    Blaster backup;                             // deep copy taken at the start (restored if you black out)
    list<string> battleLog;                     // cheap appends, written to battle_log.txt at the end
    queue<Combatant*> turnOrder;                // first in, first to act
    static int battleCount;
    bool over;
    string result;                              // "", win, lose, run
    int shield;
    string sourceId;
    int xpGained, ammoGained, mossGained;
    vector<string> levelUps;
    string caughtJson;
    bool anyFaint;
    set<int> fought;                            // slugs that fired this duel earn full XP

    void requirePlayerTurn() const;
    void requireEnemyTurn() const;
    void nextTurn();                            // pop the front and push it to the back
    void win();
    void lose();
    void faint(Slug* s);
    void note(const string& line);
public:
    Battle(Slinger& p, Enemy* e, const string& source);
    ~Battle();

    string fire();                              // returns the action as JSON
    string swap();
    string guard();
    string run();
    string moss();
    string enemyTurn();

    bool isOver() const { return over; }
    string getResult() const { return result; }
    string getSource() const { return sourceId; }
    bool hadFaint() const { return anyFaint; }
    string enemyKind() const { return enemy->getKind(); }
    OOPCard enemyCard() const { return enemy->describeOOP(); }   // virtual: boss answers differently
    string stateJson() const;
    static int getBattleCount() { return battleCount; }
    static OOPCard describeOOP();
};

}  // namespace Combat
}  // namespace Game
