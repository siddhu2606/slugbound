// world.h - Interactable (abstract), all the things you can bump into, Zone and WorldMap.
#pragma once
#include "entities.h"
#include "slinger.h"
#include "enemy.h"

namespace Game {
namespace World {

using namespace Combat;

// What happened when you interacted.  The Game turns this into JSON for the browser.
struct Outcome {
    string type;                // msg, dialog, chest, gate_open, battle, fusion, trade, altar, heal, victory
    string text;
    string speaker;
    vector<string> lines;
    string extra;               // raw JSON
    Enemy* enemy;               // set for battles (the Battle takes ownership)
    string source;              // id of the object that caused it
    Outcome() : type("msg"), extra("{}"), enemy(0) {}
};

// ---------- Interactable: ABSTRACT ----------
class Interactable {
protected:
    string id;
    Position pos;
    bool done;
    string label;
public:
    Interactable(const string& ident, Position p, const string& lab = "");
    virtual ~Interactable();

    string getId() const { return id; }
    Position getPos() const { return pos; }
    bool isDone() const { return done; }
    void setDone(bool d) { done = d; }

    virtual Outcome interact(Slinger& s) = 0;             // pure virtual
    virtual string describe() const = 0;                  // pure virtual
    virtual string kind() const = 0;
    virtual string className() const = 0;
    virtual bool blocksMovement() const { return true; }
    virtual string extraJson() const { return "{}"; }
    virtual OOPCard describeOOP() const;
    string toJson() const;
};

class Chest : public Interactable {
    int moss, ammoAmount, slugElement, slugLevel;
public:
    Chest(const string& ident, Position p, const string& lab, int mossN, int ammoN, int slugElem = -1, int slugLvl = 1);
    Outcome interact(Slinger& s) override;
    string describe() const override { return done ? "an empty chest" : "a closed chest"; }
    string kind() const override { return "chest"; }
    string className() const override { return "Chest"; }
    string extraJson() const override { return slugElement >= 0 ? "{\"rare\":true}" : "{}"; }
};

class NPC : public Interactable {
    string role;                                          // mentor or trader
    string npcName;
public:
    NPC(const string& ident, Position p, const string& who, const string& r);
    Outcome interact(Slinger& s) override;
    string describe() const override { return npcName; }
    string kind() const override { return role == "mentor" ? "mossback" : "trader"; }
    string className() const override { return "NPC"; }
};

class FusionStone : public Interactable {
public:
    FusionStone(const string& ident, Position p) : Interactable(ident, p, "Fusion Stone") {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return "a humming fusion stone"; }
    string kind() const override { return "fusionstone"; }
    string className() const override { return "FusionStone"; }
    OOPCard describeOOP() const override;
};

class HealingSpring : public Interactable {
public:
    HealingSpring(const string& ident, Position p) : Interactable(ident, p, "Heart Shard") {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return "a glowing heart shard"; }
    string kind() const override { return "spring"; }
    string className() const override { return "HealingSpring"; }
};

// All the glowing moss tiles share one WildPatch object.
class WildPatch : public Interactable {
    vector<Element> table;
    int minLevel, maxLevel, rate;
public:
    WildPatch(const string& ident, const vector<Element>& t, int lo, int hi, int ratePercent);
    Outcome interact(Slinger& s) override;                // rolls a wild slug
    Outcome forced(Element e, int level);
    int getRate() const { return rate; }
    string describe() const override { return "glowing moss where wild slugs hide"; }
    string kind() const override { return "patch"; }
    string className() const override { return "WildPatch"; }
    bool blocksMovement() const override { return false; }
};

class GhoulPatrol : public Interactable {
    string patrolName;
    Element element;
    int level, sight;
public:
    GhoulPatrol(const string& ident, Position p, const string& n, Element e, int lvl, int sightRange = 2);
    Outcome interact(Slinger& s) override;
    int getSight() const { return sight; }
    string describe() const override { return patrolName; }
    string kind() const override { return "ghoul"; }
    string className() const override { return "GhoulPatrol"; }
    bool blocksMovement() const override { return !done; }
    string extraJson() const override { return "{\"element\":\"" + elementName(element) + "\"}"; }
};

class RivalSlinger : public Interactable {
public:
    RivalSlinger(const string& ident, Position p) : Interactable(ident, p, "Rival Kessa") {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return "Kessa, a rival Slinger"; }
    string kind() const override { return "rival"; }
    string className() const override { return "RivalSlinger"; }
    bool blocksMovement() const override { return !done; }
};

// ---------- Gates: you need the right slug IN YOUR BLASTER ----------
class Gate : public Interactable {
protected:
    Element need;
    string verb;
public:
    Gate(const string& ident, Position p, const string& lab, Element e, const string& v)
        : Interactable(ident, p, lab), need(e), verb(v) {}
    Outcome interact(Slinger& s) override;                // throws GateLockedException
    string describe() const override { return label + (done ? " (open)" : " (needs " + elementName(need) + ")"); }
    bool blocksMovement() const override { return !done; }
    string extraJson() const override { return "{\"need\":\"" + elementName(need) + "\"}"; }
};

class BreakableWall : public Gate {
public:
    BreakableWall(const string& ident, Position p) : Gate(ident, p, "Cracked wall", EARTH, "smashes") {}
    string kind() const override { return "wall"; }
    string className() const override { return "BreakableWall"; }
    OOPCard describeOOP() const override;
};

class GapLedge : public Gate {
public:
    GapLedge(const string& ident, Position p) : Gate(ident, p, "Chasm ledge", AIR, "glides across") {}
    string kind() const override { return "gap"; }
    string className() const override { return "GapLedge"; }
    OOPCard describeOOP() const override;
};

class IceBridge : public Gate {
public:
    IceBridge(const string& ident, Position p) : Gate(ident, p, "Frozen crossing", ICE, "freezes") {}
    string kind() const override { return "bridge"; }
    string className() const override { return "IceBridge"; }
};

class CrystalDoor : public Gate {
public:
    CrystalDoor(const string& ident, Position p) : Gate(ident, p, "Crystal door", ENERGY, "powers") {}
    string kind() const override { return "door"; }
    string className() const override { return "CrystalDoor"; }
};

class KeepGate : public Gate {
public:
    KeepGate(const string& ident, Position p) : Gate(ident, p, "Gorvax's gate", GHOUL, "opens") {}
    Outcome interact(Slinger& s) override;                // needs 3 keystones
    string describe() const override { return done ? "Gorvax's Keep gate (open)" : "a gate sealed by 3 keystones"; }
    string kind() const override { return "keepgate"; }
    string className() const override { return "KeepGate"; }
    string extraJson() const override { return "{\"need\":\"3 Keystones\"}"; }
};

class KeystoneAltar : public Interactable {
    int number;
public:
    KeystoneAltar(const string& ident, Position p, int n) : Interactable(ident, p, "Keystone #" + to_string(n)), number(n) {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return done ? "an empty altar" : "an altar holding a keystone"; }
    string kind() const override { return "altar"; }
    string className() const override { return "KeystoneAltar"; }
};

class BossThrone : public Interactable {
public:
    BossThrone(const string& ident, Position p) : Interactable(ident, p, "Gorvax the Hollow King") {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return done ? "an empty throne" : "Gorvax the Hollow King"; }
    string kind() const override { return "boss"; }
    string className() const override { return "BossThrone"; }
    bool blocksMovement() const override { return !done; }
};

class Heartcrystal : public Interactable {
public:
    Heartcrystal(const string& ident, Position p) : Interactable(ident, p, "The Heartcrystal") {}
    Outcome interact(Slinger& s) override;
    string describe() const override { return "the Heartcrystal"; }
    string kind() const override { return "heartcrystal"; }
    string className() const override { return "Heartcrystal"; }
};

// ---------- Zone and WorldMap ----------
struct ZoneExit {
    Position at;
    string toZone;
    Position toPos;
    string label;
};

class Zone {
    string id, name, lighting;
    int width, height;
    vector<string> rows;
    vector<Interactable*> objects;                        // polymorphic list
    vector<ZoneExit> exits;
    Position start;
public:
    Zone(const string& ident, const string& title, int w, int h, const string& light, Position startPos);
    ~Zone();

    void carve(int x1, int y1, int x2, int y2, char c);
    void put(int x, int y, char c);
    void add(Interactable* o) { objects.push_back(o); }
    void addExit(Position at, const string& to, Position toPos, const string& lab);

    string getId() const { return id; }
    string getName() const { return name; }
    Position getStart() const { return start; }
    char tile(int x, int y) const;
    bool inBounds(int x, int y) const { return x >= 0 && y >= 0 && x < width && y < height; }
    bool walkable(Position p) const;
    Interactable* objectAt(Position p) const;
    Interactable* objectById(const string& ident) const;
    WildPatch* patch() const;
    const ZoneExit* exitAt(Position p) const;
    vector<Interactable*>& objectList() { return objects; }
    Outcome interact(Interactable* o, Slinger& s);        // handleInteract -> Zone::interact -> Gate::interact
    string layoutJson() const;
};

class WorldMap {
    Registry<Zone*> zones;
    vector<string> order;
public:
    WorldMap();
    ~WorldMap();
    Zone* get(const string& id) const { return zones.get(id); }
    void saveState(ofstream& out) const;
    void loadState(ifstream& in);
    OOPCard describeOOP() const;
};

}  // namespace World
}  // namespace Game
