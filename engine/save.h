// save.h - binary save and load.  Fields are written one by one (never a raw object).
#pragma once
#include "slinger.h"
#include "world.h"

namespace Game {

class SaveManager {
public:
    static const int MAGIC = 0x534C5547;       // "SLUG"
    static const int VERSION = 1;
    static void save(const string& path, const Slinger& player, const World::WorldMap& world);
    // builds a new Slinger and WorldMap; the old ones are only replaced if the whole file is valid
    static void load(const string& path, Slinger*& player, World::WorldMap*& world);
    static OOPCard describeOOP();
};

}  // namespace Game
