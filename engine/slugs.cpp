#include "slugs.h"
#include "enemy.h"

namespace Game {
namespace Combat {

int Slug::totalSlugs = 0;
int Slug::nextUid = 1;

// ---------- Slug (abstract base) ----------
Slug::Slug(const string& n, Element e, int lvl, int baseHp, int basePower)
    : element(e), power(basePower + 2 * (lvl - 1)), uid(nextUid++), name(n),
      hp(0), maxHp(baseHp + 6 * (lvl - 1)), level(lvl), xp(0), levelsGainedLast(0) {
    hp = maxHp;
    totalSlugs++;
    Logger::log("ctor", "Slug base built for '" + n + "' (Slug::totalSlugs = " + to_string(totalSlugs) + ")");
}

Slug::Slug(const Slug& o)
    : element(o.element), power(o.power), uid(o.uid), name(o.name), hp(o.hp), maxHp(o.maxHp),
      level(o.level), xp(o.xp), lastHit(o.lastHit), levelsGainedLast(0) {
    totalSlugs++;
    Logger::log("ctor", "Slug copy-constructed for '" + name + "' (Slug::totalSlugs = " + to_string(totalSlugs) + ")");
}

Slug::~Slug() {
    totalSlugs--;
    Logger::log("dtor", "Slug base destroyed (Slug::totalSlugs = " + to_string(totalSlugs) + ")");
}

int Slug::takeDamage(int d) {
    if (d < 0) d = 0;
    int before = hp;
    hp = clampValue(hp - d, 0, maxHp);
    return before - hp;
}

void Slug::healBy(int amount) { hp = clampValue(hp + amount, 0, maxHp); }

// one hit, with a flat bonus.  The virtual takeHit lets a boss minion absorb it.
int Slug::attack(Enemy& e, int boost) {
    float m = 1.0f;
    int d = DamageCalculator::slugDamage(*this, e, m) + boost;
    int dealt = e.takeHit(d);
    lastHit.hits++;
    lastHit.mult = m;
    lastHit.label = m > 1.0f ? "super" : (m < 1.0f ? "resisted" : "normal");
    if (dealt < 0) {
        lastHit.absorbed = true;
        return 0;
    }
    lastHit.damage += dealt;
    return dealt;
}

Slug& Slug::operator++() {
    level++;
    maxHp += 6;
    power += 2;
    hp = clampValue(hp + 6, 0, maxHp);
    return *this;
}

Slug& Slug::operator+=(int gained) {
    levelsGainedLast = 0;
    xp += gained;
    while (xp >= xpNeeded()) {
        xp -= xpNeeded();
        ++(*this);
        levelsGainedLast++;
    }
    return *this;
}

// FUSION: a + b reads like the game rule.  Returns a NEW GhoulSlug, so the caller owns it.
Slug* Slug::operator+(const Slug& other) const {
    int lvl = (level + other.level) / 2 + 1;
    int totalHp = (maxHp + other.maxHp) * 8 / 10 + 20;
    int totalPower = (power + other.power) * 9 / 10 + 4;
    Logger::log("op+", name + " + " + other.name + "  =>  new GhoulSlug (operator+)");
    return new GhoulSlug(lvl, totalHp, totalPower);
}

ostream& operator<<(ostream& out, const Slug& s) {
    out << s.name << " (" << elementName(s.element) << ") Lv" << s.level << " HP " << s.hp << "/" << s.maxHp;
    return out;
}

// reads: level maxHp power
istream& operator>>(istream& in, Slug& s) {
    int lvl, hpValue, pw;
    if (in >> lvl >> hpValue >> pw) {
        s.level = lvl;
        s.maxHp = hpValue;
        s.hp = hpValue;
        s.power = pw;
    }
    return in;
}

void Slug::save(ofstream& out) const {
    writeInt(out, (int)element);                 // type tag first
    writeInt(out, level);
    writeInt(out, xp);
    writeInt(out, hp);
    writeInt(out, maxHp);
    writeInt(out, power);
}

void Slug::load(ifstream& in) {
    level = readInt(in);
    xp = readInt(in);
    hp = readInt(in);
    maxHp = readInt(in);
    power = readInt(in);
    if (level < 1 || level > 99 || maxHp < 1 || hp > maxHp) throw SaveCorruptedException("Slug values out of range");
}

// polymorphic loading: read the tag, build the right subclass, let it load itself
Slug* Slug::fromFile(ifstream& in) {
    int tag = readInt(in);
    if (tag < 0 || tag > 5) throw SaveCorruptedException("Unknown slug type tag");
    Slug* s = makeSlug((Element)tag, 1);
    try {
        s->load(in);
    } catch (...) {
        delete s;
        throw;
    }
    return s;
}

string Slug::toJson() const {
    JsonObj o;
    o.add("id", uid).add("name", name).add("element", elementName(element)).add("cls", className());
    o.add("level", level).add("hp", hp).add("maxHp", maxHp).add("power", power);
    o.add("xp", xp).add("xpNeed", xpNeeded()).add("ability", ability()).add("morph", morph());
    return o.str();
}

// ---------- species ----------
static OOPCard slugCard(const Slug& s, const string& title, const string& cls, const string& what) {
    OOPCard c;
    c.title = title;
    c.badge = elementName(s.getElement()) + " type";
    c.classLine = "class " + cls + " : public Slug";
    c.inherits = "Slug (abstract)";
    c.data = "name, hp, power  (inherited from Slug)";
    c.funcs.push_back("attack()   <- overrides Slug::attack");
    c.funcs.push_back("morph()    <- pure virtual in Slug");
    c.funcs.push_back("special()  <- " + what);
    c.funcs.push_back("clone()    <- virtual copy, keeps the real type");
    c.oop.push_back("INHERITANCE: reuses name/hp/level from Slug");
    c.oop.push_back("POLYMORPHISM: Slug* calls " + cls + "'s attack() at runtime");
    c.oop.push_back("CONSTRUCTOR: [ctor] Slug first, then " + cls);
    c.viva = "A pure virtual function makes Slug abstract, so every element must override attack(). The compiler enforces that.";
    return c;
}

// Pyrolisk
FireSlug::FireSlug(int lvl) : Slug("Pyrolisk", FIRE, lvl, 34, 7) {
    Logger::log("ctor", "FireSlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
FireSlug::~FireSlug() { Logger::log("dtor", "FireSlug destroyed"); }
int FireSlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 4);                          // heavy hit
    special(e);
    return lastHit.damage;
}
void FireSlug::special(Enemy& e) {
    if (e.isAlive()) { e.setBurn(3); lastHit.effect = "burn"; }
}
Slug* FireSlug::clone() const {
    Logger::log("clone", "FireSlug::clone() called through a Slug*");
    return new FireSlug(*this);
}
OOPCard FireSlug::describeOOP() const { return slugCard(*this, "PYROLISK", "FireSlug", "burns the enemy over time"); }

// Frostmaw
IceSlug::IceSlug(int lvl) : Slug("Frostmaw", ICE, lvl, 38, 6) {
    Logger::log("ctor", "IceSlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
IceSlug::~IceSlug() { Logger::log("dtor", "IceSlug destroyed"); }
int IceSlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 0);
    special(e);
    return lastHit.damage;
}
void IceSlug::special(Enemy& e) {
    if (e.isAlive()) { e.setSlow(2); lastHit.effect = "slow"; }
}
Slug* IceSlug::clone() const {
    Logger::log("clone", "IceSlug::clone() called through a Slug*");
    return new IceSlug(*this);
}
OOPCard IceSlug::describeOOP() const { return slugCard(*this, "FROSTMAW", "IceSlug", "slows the enemy"); }

// Boulderback
EarthSlug::EarthSlug(int lvl) : Slug("Boulderback", EARTH, lvl, 48, 5) {
    Logger::log("ctor", "EarthSlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
EarthSlug::~EarthSlug() { Logger::log("dtor", "EarthSlug destroyed"); }
int EarthSlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 0);
    special(e);
    return lastHit.damage;
}
void EarthSlug::special(Enemy&) {
    lastHit.shield = 10 + 2 * level;
    lastHit.effect = "shield";
}
Slug* EarthSlug::clone() const {
    Logger::log("clone", "EarthSlug::clone() called through a Slug*");
    return new EarthSlug(*this);
}
OOPCard EarthSlug::describeOOP() const { return slugCard(*this, "BOULDERBACK", "EarthSlug", "shields you"); }

// Zephyra
AirSlug::AirSlug(int lvl) : Slug("Zephyra", AIR, lvl, 32, 5) {
    Logger::log("ctor", "AirSlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
AirSlug::~AirSlug() { Logger::log("dtor", "AirSlug destroyed"); }
int AirSlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 0);                          // first hit
    if (e.isAlive()) Slug::attack(e, 0);         // second hit
    special(e);
    return lastHit.damage;
}
void AirSlug::special(Enemy&) { lastHit.effect = "double"; }
Slug* AirSlug::clone() const {
    Logger::log("clone", "AirSlug::clone() called through a Slug*");
    return new AirSlug(*this);
}
OOPCard AirSlug::describeOOP() const { return slugCard(*this, "ZEPHYRA", "AirSlug", "hits twice"); }

// Voltick
EnergySlug::EnergySlug(int lvl) : Slug("Voltick", ENERGY, lvl, 30, 6) {
    Logger::log("ctor", "EnergySlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
EnergySlug::~EnergySlug() { Logger::log("dtor", "EnergySlug destroyed"); }
int EnergySlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 0);
    special(e);
    return lastHit.damage;
}
void EnergySlug::special(Enemy& e) {
    if (e.isAlive() && rand() % 100 < 30) { e.setStunned(true); lastHit.effect = "stun"; }
}
Slug* EnergySlug::clone() const {
    Logger::log("clone", "EnergySlug::clone() called through a Slug*");
    return new EnergySlug(*this);
}
OOPCard EnergySlug::describeOOP() const { return slugCard(*this, "VOLTICK", "EnergySlug", "30% chance to stun"); }

// Umbrafang
GhoulSlug::GhoulSlug(int lvl) : Slug("Umbrafang", GHOUL, lvl, 55, 12) {
    Logger::log("ctor", "GhoulSlug built (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
GhoulSlug::GhoulSlug(int lvl, int totalHp, int totalPower)
    : Slug("Umbrafang", GHOUL, lvl, totalHp - 6 * (lvl - 1), totalPower - 2 * (lvl - 1)) {
    Logger::log("ctor", "GhoulSlug built by FUSION (Slug::totalSlugs = " + to_string(getTotalSlugs()) + ")");
}
GhoulSlug::~GhoulSlug() { Logger::log("dtor", "GhoulSlug destroyed"); }
int GhoulSlug::attack(Enemy& e) {
    lastHit.reset();
    Slug::attack(e, 10);
    special(e);
    return lastHit.damage;
}
void GhoulSlug::special(Enemy&) {
    healBy(lastHit.damage / 5);
    lastHit.effect = "drain";
}
Slug* GhoulSlug::clone() const {
    Logger::log("clone", "GhoulSlug::clone() called through a Slug*");
    return new GhoulSlug(*this);
}
OOPCard GhoulSlug::describeOOP() const {
    OOPCard c = slugCard(*this, "UMBRAFANG", "GhoulSlug", "drains life from the hit");
    c.oop.push_back("OPERATOR+: a + b returns a NEW GhoulSlug built with new");
    c.oop.push_back("DYNAMIC MEMORY: the caller owns the result and deletes both parents");
    c.viva = "I overloaded + because fusion is conceptually addition of two slugs. The operator returns a new object, so I own the memory decision explicitly.";
    return c;
}

Slug* makeSlug(Element e, int level) {
    switch (e) {
        case FIRE: return new FireSlug(level);
        case ICE: return new IceSlug(level);
        case EARTH: return new EarthSlug(level);
        case AIR: return new AirSlug(level);
        case ENERGY: return new EnergySlug(level);
        default: return new GhoulSlug(level);
    }
}

// ---------- Blaster ----------
Blaster::Blaster() {
    Logger::log("ctor", "Blaster built (empty chamber)");
}

// DEEP copy: Slug is abstract, so we cannot write new Slug(*s). clone() keeps the real type.
Blaster::Blaster(const Blaster& other) {
    vector<Slug*> v = other.contents();
    for (size_t i = 0; i < v.size(); i++) chamber.push(v[i]->clone());
    Logger::log("ctor", "Blaster deep-copied (" + to_string(chamber.size()) + " slugs cloned)");
}

Blaster& Blaster::operator=(const Blaster& other) {
    if (this == &other) return *this;
    destroyAll();
    vector<Slug*> v = other.contents();
    for (size_t i = 0; i < v.size(); i++) chamber.push(v[i]->clone());
    return *this;
}

Blaster::~Blaster() {
    destroyAll();
    Logger::log("dtor", "Blaster destroyed");
}

void Blaster::add(Slug* s) {
    if (full()) throw GameException("The blaster only holds 4 slugs");
    chamber.push(s);
}

Slug* Blaster::front() const {
    if (chamber.empty()) return 0;
    return chamber.front();
}

Slug* Blaster::fire() {
    if (chamber.empty()) throw GameException("The blaster is empty");
    Slug* s = chamber.front();
    chamber.pop();
    chamber.push(s);                              // front goes to the back
    return s;
}

void Blaster::swap() {
    if (chamber.size() < 2) return;
    chamber.push(chamber.front());
    chamber.pop();
}

bool Blaster::remove(Slug* target) {
    bool found = false;
    int n = (int)chamber.size();
    for (int i = 0; i < n; i++) {
        Slug* s = chamber.front();
        chamber.pop();
        if (s == target) found = true;
        else chamber.push(s);
    }
    return found;
}

vector<Slug*> Blaster::contents() const {
    vector<Slug*> v;
    queue<Slug*> copy = chamber;
    while (!copy.empty()) {
        v.push_back(copy.front());
        copy.pop();
    }
    return v;
}

bool Blaster::hasAliveElement(Element e) const {
    vector<Slug*> v = contents();
    for (size_t i = 0; i < v.size(); i++)
        if (v[i]->getElement() == e && v[i]->isAlive()) return true;
    return false;
}

vector<Slug*> Blaster::releaseAll() {
    vector<Slug*> v = contents();
    while (!chamber.empty()) chamber.pop();
    return v;
}

void Blaster::destroyAll() {
    while (!chamber.empty()) {
        delete chamber.front();                  // virtual destructor: ~FireSlug then ~Slug
        chamber.pop();
    }
}

void Blaster::save(ofstream& out) const {
    vector<Slug*> v = contents();
    writeInt(out, (int)v.size());
    for (size_t i = 0; i < v.size(); i++) v[i]->save(out);
}

void Blaster::load(ifstream& in) {
    destroyAll();
    int n = readInt(in);
    if (n < 0 || n > CAPACITY) throw SaveCorruptedException("Blaster size out of range");
    for (int i = 0; i < n; i++) chamber.push(Slug::fromFile(in));
}

OOPCard Blaster::describeOOP() const {
    OOPCard c;
    c.title = "THE BLASTER";
    c.badge = "queue<Slug*>";
    c.classLine = "class Blaster";
    c.inherits = "nothing - it HAS slugs (aggregation)";
    c.data = "queue<Slug*> chamber  (holds " + to_string(chamber.size()) + " of 4)";
    c.funcs.push_back("Blaster(const Blaster&)  <- DEEP copy using clone()");
    c.funcs.push_back("fire()  <- front slug flies out and re-queues at the back");
    c.funcs.push_back("swap()  <- rotates the queue");
    c.oop.push_back("STL queue: FIFO, fire takes the front and re-queues it at the back");
    c.oop.push_back("COPY CONSTRUCTOR: Slug is abstract, so we cannot write new Slug(*s)");
    c.oop.push_back("clone(): a virtual copy keeps the real subclass (FireSlug stays FireSlug)");
    c.viva = "I chose each container for its access pattern. The blaster fires front and re-queues at the back, so it is a queue.";
    return c;
}

// ---------- Slugpedia ----------
Slugpedia::Slugpedia() {
    Logger::log("ctor", "Slugpedia built (map<string,Slug*> + set<string>)");
}

Slugpedia::~Slugpedia() {
    for (map<string, Slug*>::iterator it = entries.begin(); it != entries.end(); ++it) delete it->second;
}

// line format:  Species ELEMENT level hp power blurb...
void Slugpedia::load(istream& in) {
    string species, elem;
    while (in >> species >> elem) {
        Element e = FIRE;
        if (elem == "ICE") e = ICE;
        else if (elem == "AIR") e = AIR;
        else if (elem == "EARTH") e = EARTH;
        else if (elem == "ENERGY") e = ENERGY;
        else if (elem == "GHOUL") e = GHOUL;
        Slug* proto = makeSlug(e, 1);
        in >> *proto;                            // operator>> reads level, hp, power
        string blurb;
        getline(in, blurb);
        if (!blurb.empty() && blurb[0] == ' ') blurb = blurb.substr(1);
        entries[proto->getName()] = proto;
        blurbs[proto->getName()] = blurb;
    }
}

static const char* BUILTIN_SLUGPEDIA =
    "Pyrolisk FIRE 1 34 7 A heavy hitter whose flames keep burning after the hit.\n"
    "Frostmaw ICE 1 38 6 Slows its prey with a frosty bite. Can freeze lava into a bridge.\n"
    "Zephyra AIR 1 32 5 A quick gliding slug that hits twice. Carries you across chasms.\n"
    "Boulderback EARTH 1 48 5 A sturdy shell that shields you. Smashes cracked walls.\n"
    "Voltick ENERGY 1 30 6 Crackles with static and may stun. Powers crystal doors.\n"
    "Umbrafang GHOUL 1 55 12 A rare ghoul slug, born only from fusion. Drains life with every bite.\n";

void Slugpedia::loadDefault() {
    ifstream f("slugpedia.txt");
    if (f) {
        load(f);
        return;
    }
    istringstream in(BUILTIN_SLUGPEDIA);
    load(in);
}

void Slugpedia::discover(const string& name) {
    if (found.count(name) == 0) {
        found.insert(name);
        Logger::log("set", "Slugpedia discovered '" + name + "' (a set keeps each name once)");
    }
}

string Slugpedia::toJson() const {
    vector<string> items;
    for (map<string, Slug*>::const_iterator it = entries.begin(); it != entries.end(); ++it) {
        const Slug* s = it->second;
        JsonObj o;
        o.add("name", it->first).add("element", elementName(s->getElement())).add("cls", s->className());
        o.add("found", isFound(it->first)).add("blurb", blurbs.find(it->first)->second);
        o.add("ability", s->ability()).add("hp", s->getMaxHp());
        items.push_back(o.str());
    }
    return jarr(items);
}

OOPCard Slugpedia::cardFor(const string& name) const {
    map<string, Slug*>::const_iterator it = entries.find(name);
    if (it == entries.end()) throw GameException("No such slug in the Slugpedia");
    return it->second->describeOOP();
}

OOPCard Slugpedia::describeOOP() const {
    OOPCard c;
    c.title = "SLUGPEDIA";
    c.badge = "map + set";
    c.classLine = "class Slugpedia";
    c.inherits = "nothing";
    c.data = "map<string, Slug*> entries;  set<string> found";
    c.funcs.push_back("load(istream&)  <- reads text lines with operator>>");
    c.funcs.push_back("discover(name)  <- inserts into the set");
    c.oop.push_back("STL map: look up a slug by its name (key -> value)");
    c.oop.push_back("STL set: each slug is discovered once, no duplicates");
    c.oop.push_back("TEMPLATES: Registry<T> and Inventory<T> work the same way for any T");
    c.viva = "map stores key-value pairs (name to slug). set stores unique keys only (names the player has found).";
    return c;
}

}  // namespace Combat
}  // namespace Game
