// slinger.h - the player.  Slinger inherits Combatant AND Explorer: the diamond.
#pragma once
#include "entities.h"
#include "slugs.h"

namespace Game {

using namespace Combat;

class Slinger : public Combatant, public Explorer {
public:
    Blaster blaster;
    Inventory<Slug*> storage;                 // slugs that are not in the blaster
    Slugpedia pedia;
    set<int> cardsShown;                      // tutorial cards already seen
    set<string> flags;                        // little story switches
    string zoneId;
    int ammo;
    int maxAmmo;

    Slinger(const string& n = "Kai");
    ~Slinger();

    // this-chaining:  player.heal(10).addAmmo(2)
    Slinger& heal(int amount);
    Slinger& addAmmo(int n);
    void useAmmo();                           // throws OutOfAmmoException

    void addSlug(Slug* s);                    // into the blaster if there is room, else storage
    vector<Slug*> allSlugs() const;           // blaster first, then storage
    Slug* findSlug(int uid) const;
    bool releaseSlug(int uid);                // delete a slug for good
    void removeFromStorage(Slug* s);
    void healEverything();
    bool hasFlag(const string& f) const { return flags.count(f) > 0; }
    void setFlag(const string& f) { flags.insert(f); }

    int attack(Combatant& target) override;   // blaster bash (not used by the duel)
    OOPCard describeOOP() const override;

    string toJson() const;
    void save(ofstream& out) const;
    void load(ifstream& in);
};

}  // namespace Game
