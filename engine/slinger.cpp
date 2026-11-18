#include "slinger.h"

namespace Game {

// The virtual base Entity is built by the MOST DERIVED class, so Slinger calls Entity(...) itself.
// The Entity(...) calls inside Combatant and Explorer are skipped.
Slinger::Slinger(const string& n)
    : Entity(n, 100, Position(4, 12)), Combatant(5), Explorer(),
      zoneId("grotto"), ammo(20), maxAmmo(30) {
    pedia.loadDefault();
    Logger::log("ctor", "Slinger('" + n + "') built - the diamond is complete, ONE Entity inside");
}

Slinger::~Slinger() {
    for (int i = 0; i < storage.size(); i++) delete storage[i];
    Logger::log("dtor", "Slinger destroyed (Blaster and its slugs go next)");
}

Slinger& Slinger::heal(int amount) {
    recover(amount);
    return *this;
}

Slinger& Slinger::addAmmo(int n) {
    ammo = clampValue(ammo + n, 0, maxAmmo);
    return *this;
}

void Slinger::useAmmo() {
    if (ammo <= 0) throw OutOfAmmoException();
    ammo--;
}

void Slinger::addSlug(Slug* s) {
    pedia.discover(s->getName());
    if (!blaster.full() && s->isAlive()) blaster.add(s);
    else storage.add(s);
}

vector<Slug*> Slinger::allSlugs() const {
    vector<Slug*> all = blaster.contents();
    for (int i = 0; i < storage.size(); i++) all.push_back(storage[i]);
    return all;
}

Slug* Slinger::findSlug(int uid) const {
    vector<Slug*> all = allSlugs();
    for (size_t i = 0; i < all.size(); i++)
        if (all[i]->getUid() == uid) return all[i];
    return 0;
}

void Slinger::removeFromStorage(Slug* s) {
    for (int i = 0; i < storage.size(); i++)
        if (storage[i] == s) {
            storage.removeAt(i);
            return;
        }
}

bool Slinger::releaseSlug(int uid) {
    Slug* s = findSlug(uid);
    if (!s) return false;
    if (!blaster.remove(s)) removeFromStorage(s);
    delete s;                                  // virtual destructor: ~FireSlug, then ~Slug
    return true;
}

void Slinger::healEverything() {
    hp = maxHp;
    vector<Slug*> all = allSlugs();
    for (size_t i = 0; i < all.size(); i++) all[i]->fullHeal();
}

int Slinger::attack(Combatant& target) {
    return Combatant::attack(target, 1);
}

OOPCard Slinger::describeOOP() const {
    OOPCard c;
    c.title = name.empty() ? "SLINGER" : "YOU, THE SLINGER";
    c.badge = "The diamond";
    c.classLine = "class Slinger : public Combatant, public Explorer";
    c.inherits = "Combatant + Explorer, both virtual public Entity";
    c.data = "Blaster blaster, Inventory<Slug*> storage, ammo";
    c.funcs.push_back("heal(int)    <- returns Slinger&, so  heal(10).addAmmo(2)");
    c.funcs.push_back("attack()     <- from Combatant");
    c.funcs.push_back("interact()   <- from Explorer");
    c.oop.push_back("DIAMOND: Entity is a VIRTUAL base, so a Slinger has ONE hp, not two");
    c.oop.push_back("The most derived class (Slinger) builds the virtual base Entity first");
    c.oop.push_back("THIS CHAINING: heal(10).addAmmo(2) works because both return *this");
    c.viva = "Virtual inheritance makes Combatant and Explorer share one Entity, so Slinger has one hp, not two. The most derived class initializes the virtual base.";
    return c;
}

string Slinger::toJson() const {
    JsonObj o;
    o.add("name", name).add("hp", hp).add("maxHp", maxHp).add("ammo", ammo).add("maxAmmo", maxAmmo);
    o.add("moss", itemCount("Healing Moss")).add("keystones", keystoneCount());
    o.add("x", pos.x).add("y", pos.y).add("dir", directionName(facing)).add("guarding", guarding);
    return o.str();
}

void Slinger::save(ofstream& out) const {
    writeStr(out, name);
    writeInt(out, hp);
    writeInt(out, ammo);
    writeInt(out, itemCount("Healing Moss"));
    writeInt(out, keystoneCount());
    writeStr(out, zoneId);
    writeInt(out, pos.x);
    writeInt(out, pos.y);
    writeInt(out, (int)facing);
    writeInt(out, (int)flags.size());
    for (set<string>::const_iterator it = flags.begin(); it != flags.end(); ++it) writeStr(out, *it);
    writeInt(out, (int)cardsShown.size());
    for (set<int>::const_iterator it = cardsShown.begin(); it != cardsShown.end(); ++it) writeInt(out, *it);
    writeInt(out, (int)pedia.foundSet().size());
    for (set<string>::const_iterator it = pedia.foundSet().begin(); it != pedia.foundSet().end(); ++it) writeStr(out, *it);
    blaster.save(out);                          // the Slinger saves itself, then asks its blaster to save itself
    writeInt(out, storage.size());
    for (int i = 0; i < storage.size(); i++) storage[i]->save(out);
}

void Slinger::load(ifstream& in) {
    name = readStr(in);
    hp = clampValue(readInt(in), 0, maxHp);
    ammo = clampValue(readInt(in), 0, maxAmmo);
    int moss = readInt(in);
    int keys = readInt(in);
    zoneId = readStr(in);
    pos.x = readInt(in);
    pos.y = readInt(in);
    int f = readInt(in);
    if (f < 0 || f > 3) throw SaveCorruptedException("Bad facing value");
    facing = (Direction)f;
    int n = readInt(in);
    if (n < 0 || n > 200) throw SaveCorruptedException("Bad flag count");
    flags.clear();
    for (int i = 0; i < n; i++) flags.insert(readStr(in));
    n = readInt(in);
    if (n < 0 || n > 50) throw SaveCorruptedException("Bad card count");
    cardsShown.clear();
    for (int i = 0; i < n; i++) cardsShown.insert(readInt(in));
    n = readInt(in);
    if (n < 0 || n > 50) throw SaveCorruptedException("Bad pedia count");
    set<string> found;
    for (int i = 0; i < n; i++) found.insert(readStr(in));
    pedia.setFound(found);
    blaster.load(in);
    for (int i = 0; i < storage.size(); i++) delete storage[i];
    storage.clear();
    n = readInt(in);
    if (n < 0 || n > 60) throw SaveCorruptedException("Bad storage count");
    for (int i = 0; i < n; i++) storage.add(Slug::fromFile(in));
    // rebuild items and keystones
    items.clear();
    if (moss > 0) items.add(Items::Item("Healing Moss", moss));
    keystones.clear();
    for (int i = 0; i < keys; i++) keystones.add(Items::Keystone(i + 1, "Keystone"));
}

}  // namespace Game
