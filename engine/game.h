// game.h - GameEngine: the one object the browser (or console) talks to.
// handle(route, body) takes a route like "/move" and a small JSON body, and returns JSON.
#pragma once
#include "slinger.h"
#include "world.h"
#include "battle.h"
#include "save.h"

namespace Game {

class GameEngine {
    Slinger* player;
    World::WorldMap* world;
    Combat::Battle* battle;
    vector<string> pendingCards;
    bool victory;
    string savePath;
    bool debugRoutes;

    World::Zone* zone() const { return world->get(player->zoneId); }
    void freshGame();
    void unlock(int step);
    string cardJson(int step) const;
    string objective() const;
    string stateJson() const;
    string finish(JsonObj& o, bool ok = true);
    string eventJson(const World::Outcome& out);

    string doMove(const string& body);
    string doInteract();
    string startBattle(JsonObj& o, World::Outcome& out);
    string afterBattleAction(JsonObj& o);
    string doFuse(const string& body);
    string doTrade(const string& body);
    string doLoadout(const string& body);
    string doRelease(const string& body);
    string doMoss();
    string doInspect(const string& query);
    string doSave();
    string doLoad();
public:
    GameEngine(const string& saveFile = "slugbound.sav");
    ~GameEngine();
    void setDebug(bool on) { debugRoutes = on; }       // dev-only routes for testing (server --debug)
    string handle(const string& route, const string& body = "");
};

}  // namespace Game
