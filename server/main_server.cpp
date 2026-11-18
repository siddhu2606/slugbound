// Native HTTP server: serves the web folder and forwards /api/... calls to the C++ engine.
// This is the "classic" way to run Slugbound. The hosted version runs the SAME engine as WebAssembly.
#include "httplib.h"
#include "../engine/game.h"
#include <mutex>

int main(int argc, char** argv) {
    int port = argc > 1 ? atoi(argv[1]) : 8080;
    string webDir = argc > 2 ? argv[2] : "web";
    Game::GameEngine game;
    for (int i = 1; i < argc; i++) if (string(argv[i]) == "--debug") game.setDebug(true);
    mutex lock;
    httplib::Server svr;
    svr.set_mount_point("/", webDir.c_str());
    auto api = [&](const httplib::Request& req, httplib::Response& res) {
        string route = "/" + string(req.matches[1]);
        string query;
        for (auto it = req.params.begin(); it != req.params.end(); ++it) {
            if (!query.empty()) query += "&";
            query += it->first + "=" + it->second;
        }
        if (!query.empty()) route += "?" + query;
        lock_guard<mutex> g(lock);
        res.set_content(game.handle(route, req.body), "application/json");
        res.set_header("Cache-Control", "no-store");
    };
    svr.Get("/api/(.*)", api);
    svr.Post("/api/(.*)", api);
    cout << "Slugbound server on http://localhost:" << port << endl;
    svr.listen("0.0.0.0", port);
    return 0;
}
