#include "save.h"

namespace Game {

void SaveManager::save(const string& path, const Slinger& player, const World::WorldMap& world) {
    ofstream out(path.c_str(), ios::binary);
    if (!out) throw GameException("Could not open the save file for writing");
    writeInt(out, MAGIC);
    writeInt(out, VERSION);
    player.save(out);                           // virtual save(): Slinger -> Blaster -> each Slug
    world.saveState(out);
    out.flush();
    if (!out) throw GameException("Writing the save file failed");
    Logger::log("save", "Wrote " + path + " field by field (magic, version, slinger, blaster, slugs, world)");
}

void SaveManager::load(const string& path, Slinger*& player, World::WorldMap*& world) {
    ifstream in(path.c_str(), ios::binary);
    if (!in) throw SaveCorruptedException("No save file found");
    Slinger* np = 0;
    World::WorldMap* nw = 0;
    try {
        if (readInt(in) != MAGIC) throw SaveCorruptedException("Not a Slugbound save (bad magic number)");
        if (readInt(in) != VERSION) throw SaveCorruptedException("Save file version does not match");
        np = new Slinger();
        nw = new World::WorldMap();
        np->load(in);
        nw->loadState(in);
    } catch (...) {
        delete np;
        delete nw;
        throw;
    }
    delete player;
    delete world;
    player = np;
    world = nw;
    Logger::log("load", "Loaded " + path + ": slugs rebuilt through a type tag and Slug::fromFile()");
}

OOPCard SaveManager::describeOOP() {
    OOPCard c;
    c.title = "SAVING THE GAME";
    c.badge = "Binary files";
    c.classLine = "class SaveManager";
    c.inherits = "nothing";
    c.data = "MAGIC number, VERSION, then fields one by one";
    c.funcs.push_back("virtual void save(ofstream&) const   <- Slinger, Blaster, Slug");
    c.funcs.push_back("static Slug* Slug::fromFile(ifstream&)  <- reads a type tag");
    c.oop.push_back("BINARY FILES: ofstream with ios::binary, strings as length + bytes");
    c.oop.push_back("NEVER write(this, sizeof(*this)): a vtable pointer would be stored");
    c.oop.push_back("POLYMORPHIC LOADING: type tag -> factory -> right subclass");
    c.oop.push_back("ERROR HANDLING: bad magic or short read throws SaveCorruptedException");
    c.viva = "I serialize field by field with a type tag, because Slug* is polymorphic and raw sizeof writes would store a vtable pointer.";
    return c;
}

}  // namespace Game
