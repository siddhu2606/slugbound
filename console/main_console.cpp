// A tiny text front end for the engine. Type a route and an optional JSON body:
//   /move {"dir":"right"}
//   /interact
//   /state
// It is the testing tool, and the fallback if a standalone C++ program is required.
#include "../engine/game.h"

int main() {
    Logger::echo = getenv("SLUG_ECHO") != 0;
    Game::GameEngine game;
    cout << "SLUGBOUND console. Type  /route  [json body].  Examples: /state   /move {\"dir\":\"up\"}   quit\n";
    string line;
    while (getline(cin, line)) {
        if (line == "quit" || line == "exit") break;
        if (line.empty()) continue;
        size_t sp = line.find(' ');
        string route = sp == string::npos ? line : line.substr(0, sp);
        string body = sp == string::npos ? "" : line.substr(sp + 1);
        cout << game.handle(route, body) << "\n";
    }
    return 0;
}
