#include "world.h"

namespace Game {

// Explorer::interact lives here because it needs the Interactable class.
// It downcasts this (Explorer*) to Slinger* with dynamic_cast.
World::Outcome Explorer::interact(World::Interactable& obj) {
    Slinger* me = dynamic_cast<Slinger*>(this);
    if (!me) throw InvalidMoveException("Only a Slinger can interact");
    return obj.interact(*me);
}

namespace World {

// ---------- helpers ----------
static const char* WILD_NAMES[] = {"Wild Pyrolisk", "Wild Frostmaw", "Wild Zephyra", "Wild Boulderback", "Wild Voltick"};
static const int WILD_HP[] = {34, 38, 32, 48, 30};
static const int WILD_POWER[] = {7, 6, 5, 5, 6};

static Enemy* makeWildEnemy(Element e, int lvl) {
    int hpValue = (WILD_HP[e] + 6 * (lvl - 1)) * 13 / 10;
    int pw = WILD_POWER[e] + 2 * (lvl - 1);
    return new Enemy(WILD_NAMES[e], e, lvl, hpValue, pw, "wild");
}

// ---------- Interactable ----------
Interactable::Interactable(const string& ident, Position p, const string& lab)
    : id(ident), pos(p), done(false), label(lab) {}

Interactable::~Interactable() {}

OOPCard Interactable::describeOOP() const {
    OOPCard c;
    c.title = label.empty() ? className() : label;
    c.badge = "Interactable";
    c.classLine = "class " + className() + " : public Interactable";
    c.inherits = "Interactable (abstract)";
    c.data = "id, pos, done, label";
    c.funcs.push_back("interact(Slinger&)  <- pure virtual in Interactable");
    c.funcs.push_back("describe()          <- pure virtual in Interactable");
    c.oop.push_back("ABSTRACT CLASS: you cannot create a plain Interactable");
    c.oop.push_back("POLYMORPHISM: Zone holds vector<Interactable*>, each interact() differs");
    c.viva = "An abstract class has at least one pure virtual function. You cannot make an object of it, but you can hold pointers to it.";
    return c;
}

string Interactable::toJson() const {
    JsonObj o;
    o.add("id", id).add("kind", kind()).add("cls", className()).add("x", pos.x).add("y", pos.y);
    o.add("done", done).add("label", label).add("desc", describe());
    o.raw("extra", extraJson());
    return o.str();
}

// ---------- Chest ----------
Chest::Chest(const string& ident, Position p, const string& lab, int mossN, int ammoN, int slugElem, int slugLvl)
    : Interactable(ident, p, lab), moss(mossN), ammoAmount(ammoN), slugElement(slugElem), slugLevel(slugLvl) {}

Outcome Chest::interact(Slinger& s) {
    Outcome o;
    o.type = "chest";
    if (done) {
        o.text = "The chest is empty.";
        return o;
    }
    done = true;
    vector<string> got;
    if (moss > 0) { s.addItem("Healing Moss", moss); got.push_back(to_string(moss) + " Healing Moss"); }
    if (ammoAmount > 0) { s.addAmmo(ammoAmount); got.push_back(to_string(ammoAmount) + " ammo"); }
    if (slugElement >= 0) {
        Slug* g = makeSlug((Element)slugElement, slugLevel);
        o.extra = "{\"slug\":" + g->toJson() + "}";
        got.push_back(g->getName());
        s.addSlug(g);
    }
    o.text = "You found ";
    for (size_t i = 0; i < got.size(); i++) o.text += (i ? ", " : "") + got[i];
    o.text += "!";
    return o;
}

// ---------- NPC ----------
NPC::NPC(const string& ident, Position p, const string& who, const string& r)
    : Interactable(ident, p, who), role(r), npcName(who) {}

Outcome NPC::interact(Slinger& s) {
    Outcome o;
    o.speaker = npcName;
    if (role == "trader") {
        o.type = "trade";
        o.lines.push_back("Psst! Got a spare slug sleeping in storage?");
        o.lines.push_back("I will swap any spare for a lively young Voltick. Take your pick.");
        o.extra = "{\"spare\":" + to_string(s.storage.size()) + "}";
        return o;
    }
    // Old Mossback, the mentor
    o.type = "dialog";
    if (!s.hasFlag("starter")) {
        o.lines.push_back("Ahh, you are awake, little Slinger. The cave is dark... Gorvax has stolen the Heartcrystal's light.");
        o.lines.push_back("You will need slugs. Take this one: Pyrolisk, a fire slug with a temper. Treat it well.");
        Slug* g = new FireSlug(1);
        o.extra = "{\"gift\":" + g->toJson() + "}";
        s.addSlug(g);
        s.setFlag("starter");
        o.lines.push_back("Press P to read your Slugpedia, B to open your blaster. Then step into the glowing moss and duel a wild slug!");
    } else if (s.cardsShown.count(5) && !s.hasFlag("gift_boulder")) {
        Slug* g = new EarthSlug(2);
        o.extra = "{\"gift\":" + g->toJson() + "}";
        s.addSlug(g);
        s.setFlag("gift_boulder");
        o.lines.push_back("Well fought! Now take Boulderback. It can smash cracked walls, but only if it is IN your blaster.");
        o.lines.push_back("Try the cracked wall in the east of the cave. Then try the chasm beyond it... and see what happens.");
    } else if (!s.cardsShown.count(3)) {
        o.lines.push_back("Press P to open the Slugpedia. Every slug you meet is written there.");
    } else if (!s.cardsShown.count(4)) {
        o.lines.push_back("Press B to open the blaster. It holds 4 slugs in a queue. The front one fires first.");
    } else if (!s.cardsShown.count(5)) {
        o.lines.push_back("Walk into the glowing moss. Wild slugs hide there. Duel one!");
    } else if (!s.cardsShown.count(9)) {
        o.lines.push_back("Next, the Fusion Stone beside me. Fuse two slugs into a Ghoul slug. Powerful, but the two are lost.");
    } else if (!s.cardsShown.count(10)) {
        o.lines.push_back("Save your journey with the menu (Esc), then Save. The Heartcrystal shards also heal you.");
    } else if (s.keystoneCount() < 3) {
        o.lines.push_back("Find 3 keystones in the Crystal Hollows and the Magma Vein. Match your blaster to each gate: Earth smashes, Ice freezes, Air glides, Energy powers.");
    } else {
        o.lines.push_back("Three keystones! The Keep gate in the Magma Vein will open for you. Go, take back the light.");
    }
    s.heal(100);
    s.healEverything();
    o.lines.push_back("(Mossback's glowing moss mends you and your slugs.)");
    return o;
}

// ---------- FusionStone / HealingSpring ----------
Outcome FusionStone::interact(Slinger& s) {
    Outcome o;
    o.type = "fusion";
    o.speaker = "Fusion Stone";
    o.text = s.allSlugs().size() >= 2 ? "Choose two slugs to fuse. Both will be lost." : "You need at least two slugs to fuse.";
    return o;
}

OOPCard FusionStone::describeOOP() const {
    OOPCard c;
    c.title = "FUSION";
    c.badge = "operator+";
    c.classLine = "Slug* Slug::operator+(const Slug&) const";
    c.inherits = "member of the abstract class Slug";
    c.data = "returns a NEW GhoulSlug (allocated with new)";
    c.funcs.push_back("operator+  <- a + b reads like the game rule");
    c.funcs.push_back("operator>, ==, ++, +=, <<, >>  <- also overloaded on Slug");
    c.oop.push_back("OPERATOR OVERLOADING: Pyrolisk + Frostmaw = Umbrafang");
    c.oop.push_back("DYNAMIC MEMORY: the operator allocates, the caller deletes both parents");
    c.viva = "I overloaded + because fusion is conceptually addition of two slugs. The operator returns a new object, so I own the memory decision explicitly.";
    return c;
}

Outcome HealingSpring::interact(Slinger& s) {
    Outcome o;
    o.type = "heal";
    s.healEverything();
    if (s.ammo < 20) s.addAmmo(20 - s.ammo);
    o.text = "The heart shard hums. Your slugs, your health and your ammo are restored.";
    return o;
}

// ---------- WildPatch ----------
WildPatch::WildPatch(const string& ident, const vector<Element>& t, int lo, int hi, int ratePercent)
    : Interactable(ident, Position(0, 0), "Wild patch"), table(t), minLevel(lo), maxLevel(hi), rate(ratePercent) {}

Outcome WildPatch::interact(Slinger&) {
    Element e = table[gameRand() % table.size()];
    int lvl = minLevel + gameRand() % (maxLevel - minLevel + 1);
    return forced(e, lvl);
}

Outcome WildPatch::forced(Element e, int level) {
    Outcome o;
    o.type = "battle";
    o.enemy = makeWildEnemy(e, level);
    o.text = "A wild " + string(WILD_NAMES[e]).substr(5) + " leaps out of the moss!";
    o.source = id;
    return o;
}

// ---------- GhoulPatrol / Rival ----------
GhoulPatrol::GhoulPatrol(const string& ident, Position p, const string& n, Element e, int lvl, int sightRange)
    : Interactable(ident, p, n), patrolName(n), element(e), level(lvl), sight(sightRange) {}

Outcome GhoulPatrol::interact(Slinger&) {
    Outcome o;
    if (done) {
        o.text = "Nothing left here but a faint chill.";
        return o;
    }
    o.type = "battle";
    o.enemy = new Enemy(patrolName, element, level, 36 + 9 * level, 3 + level, "ghoul");
    o.text = patrolName + " spots you!";
    o.source = id;
    return o;
}

Outcome RivalSlinger::interact(Slinger&) {
    Outcome o;
    if (done) {
        o.type = "msg";
        o.text = "Kessa waves you on. 'Go. Beat him for both of us.'";
        return o;
    }
    o.type = "battle";
    o.speaker = "Kessa";
    o.lines.push_back("So you are the Slinger everyone talks about. Show me those slugs!");
    o.enemy = new Enemy("Rival Kessa", ICE, 6, 135, 8, "rival");
    o.source = id;
    return o;
}

// ---------- Gates ----------
// handleInteract() -> Zone::interact() -> Gate::interact()
// The two local ScopedLogger objects are destroyed in REVERSE order when the exception unwinds the stack.
Outcome Gate::interact(Slinger& s) {
    ScopedLogger scope("gate check: " + label);
    Slug* probe = 0;
    ScopedLogger scan("slug scan");
    vector<Slug*> v = s.blaster.contents();
    for (size_t i = 0; i < v.size(); i++)
        if (v[i]->getElement() == need && v[i]->isAlive()) probe = v[i];
    Outcome o;
    if (!probe) {
        string msg = "Need an " + elementName(need) + " slug in your blaster";
        Logger::log("throw", "GateLockedException: " + msg);
        throw GateLockedException(msg);
    }
    done = true;
    o.type = "gate_open";
    o.text = probe->getName() + " " + verb + " the way open!";
    o.extra = "{\"kind\":\"" + kind() + "\",\"slug\":" + probe->toJson() + "}";
    o.source = id;
    return o;
}

Outcome KeepGate::interact(Slinger& s) {
    ScopedLogger scope("keystone check");
    Slug* probe = 0;
    ScopedLogger scan("keystone count");
    Outcome o;
    if (s.keystoneCount() < 3) {
        string msg = "The gate needs 3 keystones (you carry " + to_string(s.keystoneCount()) + ")";
        Logger::log("throw", "GateLockedException: " + msg);
        throw GateLockedException(msg);
    }
    (void)probe;
    done = true;
    o.type = "gate_open";
    o.text = "Three keystones blaze! The gate to Gorvax's Keep grinds open.";
    o.extra = "{\"kind\":\"keepgate\"}";
    o.source = id;
    return o;
}

OOPCard BreakableWall::describeOOP() const {
    OOPCard c;
    c.title = "CRACKED WALL";
    c.badge = "Earth gate";
    c.classLine = "class BreakableWall : public Gate : public Interactable";
    c.inherits = "Gate -> Interactable (abstract)";
    c.data = "Element need = EARTH, bool done";
    c.funcs.push_back("interact(Slinger&)  <- Gate::interact, pure virtual in Interactable");
    c.funcs.push_back("blocksMovement()    <- true until the wall is smashed");
    c.oop.push_back("ABSTRACT CLASS: Interactable has pure virtual interact()");
    c.oop.push_back("DOWNCASTING: dynamic_cast<BreakableWall*> on an Interactable* checks the real type");
    c.oop.push_back("UPCASTING: the Zone stores the wall as a plain Interactable*");
    c.viva = "Upcasting is implicit and safe. dynamic_cast checks the real type at runtime and returns nullptr if wrong.";
    return c;
}

OOPCard GapLedge::describeOOP() const {
    OOPCard c;
    c.title = "CHASM LEDGE";
    c.badge = "Air gate";
    c.classLine = "class GapLedge : public Gate : public Interactable";
    c.inherits = "Gate -> Interactable (abstract)";
    c.data = "Element need = AIR";
    c.funcs.push_back("interact(Slinger&)  <- throws GateLockedException if no Air slug");
    c.oop.push_back("EXCEPTIONS: the throw happens deep in the call chain");
    c.oop.push_back("STACK UNWINDING: locals are destroyed in reverse order before the catch runs");
    c.viva = "When an exception is thrown, C++ destroys every local object between the throw and the matching catch, in reverse order of construction.";
    return c;
}

// ---------- Altars, boss, crystal ----------
Outcome KeystoneAltar::interact(Slinger& s) {
    Outcome o;
    if (done) {
        o.text = "The altar is quiet. Its keystone is already yours.";
        return o;
    }
    done = true;
    s.addKeystone(Items::Keystone(number, "Keystone"));
    o.type = "altar";
    o.text = "You take Keystone #" + to_string(number) + "! (" + to_string(s.keystoneCount()) + " of 3)";
    o.extra = "{\"number\":" + to_string(number) + "}";
    return o;
}

Outcome BossThrone::interact(Slinger&) {
    Outcome o;
    if (done) {
        o.text = "The throne is empty. The Heartcrystal waits behind it.";
        return o;
    }
    o.type = "battle";
    o.speaker = "Gorvax";
    o.lines.push_back("A child with a toy blaster? The light is MINE, Slinger!");
    o.enemy = new BossEnemy("Gorvax the Hollow King", 10, 520, 12);
    o.source = id;
    return o;
}

Outcome Heartcrystal::interact(Slinger& s) {
    Outcome o;
    if (!s.hasFlag("boss_down")) {
        o.text = "The Heartcrystal is dark and cold. Gorvax still stands in the way.";
        return o;
    }
    o.type = "victory";
    o.text = "You lay your hand on the Heartcrystal. Light floods Hollowdeep.";
    return o;
}

// ---------- Zone ----------
Zone::Zone(const string& ident, const string& title, int w, int h, const string& light, Position startPos)
    : id(ident), name(title), lighting(light), width(w), height(h), start(startPos) {
    rows.assign(h, string(w, '#'));
}

Zone::~Zone() {
    for (size_t i = 0; i < objects.size(); i++) delete objects[i];
}

void Zone::carve(int x1, int y1, int x2, int y2, char c) {
    for (int y = y1; y <= y2; y++)
        for (int x = x1; x <= x2; x++) rows[y][x] = c;
}

void Zone::put(int x, int y, char c) { rows[y][x] = c; }

void Zone::addExit(Position at, const string& to, Position toPos, const string& lab) {
    ZoneExit e;
    e.at = at;
    e.toZone = to;
    e.toPos = toPos;
    e.label = lab;
    exits.push_back(e);
}

char Zone::tile(int x, int y) const {
    if (!inBounds(x, y)) return '#';
    return rows[y][x];
}

Interactable* Zone::objectAt(Position p) const {
    for (size_t i = 0; i < objects.size(); i++)
        if (objects[i]->kind() != "patch" && objects[i]->getPos() == p) return objects[i];
    return 0;
}

Interactable* Zone::objectById(const string& ident) const {
    for (size_t i = 0; i < objects.size(); i++)
        if (objects[i]->getId() == ident) return objects[i];
    return 0;
}

WildPatch* Zone::patch() const {
    for (size_t i = 0; i < objects.size(); i++) {
        WildPatch* w = dynamic_cast<WildPatch*>(objects[i]);
        if (w) return w;
    }
    return 0;
}

const ZoneExit* Zone::exitAt(Position p) const {
    for (size_t i = 0; i < exits.size(); i++)
        if (exits[i].at == p) return &exits[i];
    return 0;
}

bool Zone::walkable(Position p) const {
    char t = tile(p.x, p.y);
    if (t != '.' && t != 'm') return false;
    Interactable* o = objectAt(p);
    if (o && o->blocksMovement()) return false;
    return true;
}

Outcome Zone::interact(Interactable* o, Slinger& s) {
    Logger::log("call", "Interactable* -> interact()  =>  " + o->className() + "::interact()");
    Outcome out = s.interact(*o);                         // Explorer::interact does the downcast to Slinger
    if (BreakableWall* w = dynamic_cast<BreakableWall*>(o))
        Logger::log("cast", "dynamic_cast<BreakableWall*> succeeded: '" + w->getId() + "' really is a wall");
    return out;
}

string Zone::layoutJson() const {
    JsonObj o;
    o.add("id", id).add("name", name).add("lighting", lighting).add("w", width).add("h", height);
    o.raw("rows", jstrs(rows));
    vector<string> objs;
    for (size_t i = 0; i < objects.size(); i++) objs.push_back(objects[i]->toJson());
    o.raw("objects", jarr(objs));
    vector<string> ex;
    for (size_t i = 0; i < exits.size(); i++) {
        JsonObj e;
        e.add("x", exits[i].at.x).add("y", exits[i].at.y).add("to", exits[i].toZone).add("label", exits[i].label);
        ex.push_back(e.str());
    }
    o.raw("exits", jarr(ex));
    WildPatch* wp = patch();
    o.add("hasPatch", wp != 0);
    return o.str();
}

// ---------- the four zones ----------
static Zone* buildGrotto() {
    Zone* z = new Zone("grotto", "Glowmoss Grotto", 24, 16, "grotto", Position(4, 12));
    z->carve(1, 1, 12, 8, '.');                           // west cave
    z->carve(1, 9, 22, 14, '.');                          // big hall
    z->carve(13, 4, 13, 4, '.');                          // the cracked wall sits here
    z->carve(14, 1, 22, 7, '.');                          // secret room
    z->carve(18, 1, 18, 7, 'g');                          // chasm
    z->put(18, 4, '.');                                   // the ledge
    z->carve(3, 2, 8, 6, 'm');                            // glowmoss
    z->carve(14, 10, 16, 12, 'm');
    z->carve(10, 10, 11, 11, 'w');                        // pond
    int props[][2] = {{2, 2}, {11, 6}, {1, 14}, {22, 9}, {12, 13}, {21, 5}, {15, 6}, {9, 2}, {1, 8}};
    for (int i = 0; i < 9; i++) z->put(props[i][0], props[i][1], 'T');
    z->add(new HealingSpring("g_spring", Position(2, 11)));
    z->add(new NPC("g_mossback", Position(6, 11), "Old Mossback", "mentor"));
    z->add(new FusionStone("g_fusion", Position(8, 11)));
    z->add(new NPC("g_trader", Position(17, 12), "Trader Pim", "trader"));
    z->add(new Chest("g_chest1", Position(15, 2), "Moss chest", 2, 6));
    z->add(new Chest("g_egg", Position(21, 2), "Rare Slug Egg", 0, 0, ENERGY, 3));
    z->add(new Chest("g_chest3", Position(20, 13), "Supply chest", 1, 8));
    z->add(new BreakableWall("g_wall", Position(13, 4)));
    z->add(new GapLedge("g_gap", Position(18, 4)));
    vector<Element> t;
    t.push_back(ICE); t.push_back(EARTH); t.push_back(AIR); t.push_back(AIR);
    z->add(new WildPatch("g_patch", t, 1, 3, 22));
    z->addExit(Position(22, 12), "hollows", Position(2, 8), "Crystal Hollows");
    return z;
}

static Zone* buildHollows() {
    Zone* z = new Zone("hollows", "Crystal Hollows", 24, 16, "hollows", Position(2, 8));
    z->carve(1, 4, 22, 11, '.');                          // main hall
    z->carve(2, 1, 8, 2, '.');                            // keystone 1 chamber
    z->put(5, 3, '.');                                    // cracked wall
    z->carve(14, 12, 20, 12, 'w');                        // frozen pond row
    z->put(17, 12, '.');                                  // ice bridge
    z->carve(14, 13, 21, 14, '.');                        // keystone 2 chamber
    z->carve(3, 9, 7, 10, 'm');
    z->carve(13, 5, 17, 7, 'm');
    int props[][2] = {{3, 7}, {10, 5}, {12, 10}, {19, 6}, {8, 9}, {15, 9}, {21, 10}, {1, 5}, {22, 5}};
    for (int i = 0; i < 9; i++) z->put(props[i][0], props[i][1], 'T');
    z->add(new HealingSpring("h_spring", Position(3, 5)));
    z->add(new KeystoneAltar("h_altar1", Position(5, 1), 1));
    z->add(new BreakableWall("h_wall", Position(5, 3)));
    z->add(new IceBridge("h_bridge", Position(17, 12)));
    z->add(new KeystoneAltar("h_altar2", Position(17, 14), 2));
    z->add(new Chest("h_chest1", Position(21, 8), "Frost chest", 2, 5));
    z->add(new Chest("h_chest2", Position(2, 10), "Cave chest", 1, 6));
    z->add(new GhoulPatrol("h_ghoul1", Position(11, 8), "Frost Ghoul", ICE, 3, 2));
    z->add(new GhoulPatrol("h_ghoul2", Position(19, 9), "Frost Ghoul", ICE, 4, 2));
    vector<Element> t;
    t.push_back(ICE); t.push_back(ENERGY); t.push_back(AIR); t.push_back(EARTH);
    z->add(new WildPatch("h_patch", t, 3, 5, 22));
    z->addExit(Position(1, 8), "grotto", Position(21, 12), "Glowmoss Grotto");
    z->addExit(Position(22, 7), "vein", Position(2, 12), "Magma Vein");
    return z;
}

static Zone* buildVein() {
    Zone* z = new Zone("vein", "Magma Vein", 24, 16, "vein", Position(2, 12));
    z->carve(1, 5, 22, 14, '.');                          // cave
    z->carve(9, 5, 9, 14, '~');                           // lava river
    z->put(9, 10, '.');                                   // ice bridge
    z->carve(16, 5, 16, 14, 'g');                         // chasm
    z->put(16, 11, '.');                                  // ledge
    z->carve(14, 1, 22, 3, '.');                          // keystone 3 chamber
    z->put(19, 4, '.');                                   // crystal door
    z->carve(2, 7, 7, 9, 'm');
    z->carve(11, 6, 14, 8, 'm');
    int props[][2] = {{4, 13}, {7, 6}, {12, 12}, {14, 5}, {18, 7}, {21, 10}, {20, 13}, {5, 5}, {2, 14}};
    for (int i = 0; i < 9; i++) z->put(props[i][0], props[i][1], 'T');
    z->add(new HealingSpring("v_spring", Position(2, 6)));
    z->add(new IceBridge("v_bridge", Position(9, 10)));
    z->add(new GapLedge("v_gap", Position(16, 11)));
    z->add(new CrystalDoor("v_door", Position(19, 4)));
    z->add(new KeystoneAltar("v_altar3", Position(19, 2), 3));
    z->add(new KeepGate("v_keepgate", Position(22, 13)));
    z->add(new RivalSlinger("v_rival", Position(15, 11)));
    z->add(new GhoulPatrol("v_ghoul1", Position(12, 12), "Ash Ghoul", FIRE, 5, 2));
    z->add(new GhoulPatrol("v_ghoul2", Position(20, 8), "Ash Ghoul", FIRE, 6, 2));
    z->add(new Chest("v_chest1", Position(3, 13), "Ember chest", 2, 6));
    z->add(new Chest("v_chest2", Position(21, 6), "Basalt chest", 2, 6));
    vector<Element> t;
    t.push_back(FIRE); t.push_back(ENERGY); t.push_back(EARTH); t.push_back(FIRE);
    z->add(new WildPatch("v_patch", t, 5, 7, 22));
    z->addExit(Position(1, 12), "hollows", Position(21, 7), "Crystal Hollows");
    z->addExit(Position(22, 13), "keep", Position(11, 13), "Gorvax's Keep");
    return z;
}

static Zone* buildKeep() {
    Zone* z = new Zone("keep", "Gorvax's Keep", 24, 16, "keep", Position(11, 13));
    z->carve(3, 3, 20, 14, '.');
    z->carve(9, 1, 13, 2, '.');                           // Heartcrystal alcove
    int props[][2] = {{9, 3}, {10, 3}, {12, 3}, {13, 3}, {6, 5}, {6, 9}, {17, 5}, {17, 9}, {6, 12}, {17, 12}, {4, 7}, {19, 7}};
    for (int i = 0; i < 12; i++) z->put(props[i][0], props[i][1], 'T');
    z->add(new HealingSpring("k_spring", Position(4, 13)));
    z->add(new GhoulPatrol("k_ghoul1", Position(8, 9), "Keep Sentinel", GHOUL, 8, 2));
    z->add(new GhoulPatrol("k_ghoul2", Position(14, 9), "Keep Sentinel", GHOUL, 8, 2));
    z->add(new BossThrone("k_boss", Position(11, 3)));
    z->add(new Heartcrystal("k_heart", Position(11, 1)));
    z->add(new Chest("k_chest", Position(19, 13), "Last supplies", 3, 10));
    z->addExit(Position(11, 14), "vein", Position(21, 13), "Magma Vein");
    return z;
}

// ---------- WorldMap ----------
WorldMap::WorldMap() {
    Zone* z[4] = {buildGrotto(), buildHollows(), buildVein(), buildKeep()};
    for (int i = 0; i < 4; i++) {
        zones.add(z[i]->getId(), z[i]);
        order.push_back(z[i]->getId());
    }
    Logger::log("ctor", "WorldMap built: 4 zones in a Registry<Zone*>");
}

WorldMap::~WorldMap() {
    for (size_t i = 0; i < order.size(); i++) delete zones.get(order[i]);
}

void WorldMap::saveState(ofstream& out) const {
    for (size_t i = 0; i < order.size(); i++) {
        vector<Interactable*>& objs = zones.get(order[i])->objectList();
        writeInt(out, (int)objs.size());
        for (size_t j = 0; j < objs.size(); j++) {
            writeStr(out, objs[j]->getId());
            writeInt(out, objs[j]->isDone() ? 1 : 0);
        }
    }
}

void WorldMap::loadState(ifstream& in) {
    for (size_t i = 0; i < order.size(); i++) {
        Zone* z = zones.get(order[i]);
        int n = readInt(in);
        if (n < 0 || n > 200) throw SaveCorruptedException("Bad object count");
        for (int j = 0; j < n; j++) {
            string ident = readStr(in);
            int d = readInt(in);
            Interactable* o = z->objectById(ident);
            if (o) o->setDone(d != 0);
        }
    }
}

OOPCard WorldMap::describeOOP() const {
    OOPCard c;
    c.title = "THE WORLD";
    c.badge = "map of Zones";
    c.classLine = "class WorldMap  ->  Registry<Zone*>";
    c.inherits = "nothing";
    c.data = "Registry<Zone*> zones (a map<string, Zone*> inside)";
    c.funcs.push_back("Zone: vector<Interactable*> objects  <- polymorphic list");
    c.oop.push_back("TEMPLATE: Registry<T> looks things up by name, for any T");
    c.oop.push_back("STL vector: ordered, indexable, holds base pointers");
    c.viva = "Zone holds a vector of Interactable pointers, so one loop can interact() with a chest, a wall or an NPC.";
    return c;
}

}  // namespace World
}  // namespace Game
