// The same C++ engine, compiled to WebAssembly. The browser calls slug_api("/move", "{\"dir\":\"up\"}") and gets JSON back.
#include "../engine/game.h"
#include <emscripten.h>

static Game::GameEngine* game = 0;
static string answer;

extern "C" {
EMSCRIPTEN_KEEPALIVE const char* slug_api(const char* route, const char* body) {
    if (!game) {
        Logger::echo = false;                         // the browser shows the lines in the Code Lens console
        game = new Game::GameEngine("/slugbound.sav");
    }
    answer = game->handle(route, body);
    return answer.c_str();
}
}
