#!/usr/bin/env bash
# Build helper.   ./build.sh test     C++ unit tests
#                 ./build.sh play     native server on http://localhost:8080 (serves web/)
#                 ./build.sh console  text-mode game
#                 ./build.sh bot      play the whole game through the API (needs the server running)
#                 ./build.sh wasm     compile the engine to WebAssembly into web/engine/ (needs Emscripten)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
CXX=${CXX:-g++}
FLAGS="-std=c++17 -O1 -Wall -Wextra"
# On Windows (MSYS2 / MinGW) link statically: it avoids mixed-DLL crashes when several MinGW installs are on the PATH.
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) FLAGS="$FLAGS -static";; esac
case "${1:-test}" in
  test)
    $CXX $FLAGS ${SAN_CHECK:+-fsanitize=address,undefined} -o build/tests tests/test_engine.cpp engine/*.cpp
    (cd build && ./tests)
    ;;
  console)
    $CXX $FLAGS -o build/console console/main_console.cpp engine/*.cpp
    ./build/console
    ;;
  play)
    EXTRA=""; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXTRA="-lws2_32 -lpthread";; *) EXTRA="-pthread";; esac
    $CXX $FLAGS -o build/server server/main_server.cpp engine/*.cpp $EXTRA
    echo "Open http://localhost:8080/index.html?server"
    ./build/server 8080 web
    ;;
  bot)
    node tools/bot.js "${2:-8080}"
    ;;
  wasm)
    mkdir -p web/engine
    em++ -std=c++17 -O2 wasm/main_wasm.cpp engine/*.cpp -o web/engine/engine.js \
      -sEXPORTED_FUNCTIONS=_slug_api -sEXPORTED_RUNTIME_METHODS=cwrap,FS -sFORCE_FILESYSTEM=1 \
      -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=SlugEngine -sENVIRONMENT=web
    ls -la web/engine
    ;;
  *) echo "unknown target"; exit 1 ;;
esac
