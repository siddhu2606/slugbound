// common.h - small shared things: elements, positions, logging, exceptions, JSON helpers.
#pragma once
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <list>
#include <map>
#include <set>
#include <queue>
#include <stack>
#include <algorithm>
#include <cstdlib>
#include <ctime>
#include <exception>
using namespace std;

// ---------- Elements and the element wheel ----------
// Fire -> Ice -> Air -> Earth -> Energy -> Fire.  Ghoul is neutral to everything.
enum Element { FIRE = 0, ICE, AIR, EARTH, ENERGY, GHOUL };

string elementName(Element e);
Element beats(Element e);          // the element this one is super effective against

// ---------- Positions and directions ----------
enum Direction { UP, DOWN, LEFT, RIGHT };

struct Position {
    int x;
    int y;
    Position(int px = 0, int py = 0) : x(px), y(py) {}
    bool operator==(const Position& o) const { return x == o.x && y == o.y; }
    bool operator!=(const Position& o) const { return !(*this == o); }
};

Direction parseDirection(const string& s);
string directionName(Direction d);
Position stepFrom(Position p, Direction d);

// ---------- Logger: every constructor/destructor/throw prints one line ----------
// Lines are printed with cout and also kept in a list so the browser can show them
// in the Code Lens console.
class Logger {
public:
    static list<string> lines;
    static bool echo;
    static void log(const string& tag, const string& msg);
    static list<string> take();
};

// ---------- Exception hierarchy ----------
class GameException : public exception {
protected:
    string msg;
public:
    GameException(const string& m) : msg(m) {}
    const char* what() const noexcept override { return msg.c_str(); }
    virtual string kind() const { return "GameException"; }
};
class OutOfAmmoException : public GameException {
public:
    OutOfAmmoException() : GameException("The blaster is out of ammo") {}
    string kind() const override { return "OutOfAmmoException"; }
};
class InvalidMoveException : public GameException {
public:
    InvalidMoveException(const string& m) : GameException(m) {}
    string kind() const override { return "InvalidMoveException"; }
};
class GateLockedException : public GameException {
public:
    GateLockedException(const string& m) : GameException(m) {}
    string kind() const override { return "GateLockedException"; }
};
class SaveCorruptedException : public GameException {
public:
    SaveCorruptedException(const string& m) : GameException(m) {}
    string kind() const override { return "SaveCorruptedException"; }
};

// A local object that prints when it is built and destroyed.
// Used in the gate code so the player can SEE stack unwinding.
class ScopedLogger {
    string label;
public:
    ScopedLogger(const string& l) : label(l) { Logger::log("ctor", "ScopedLogger '" + label + "' created"); }
    ~ScopedLogger() { Logger::log("dtor", "ScopedLogger '" + label + "' destroyed (stack unwinding)"); }
};

// ---------- OOP card: produced by classes through describeOOP() ----------
struct OOPCard {
    string title;
    string badge;
    string classLine;
    string inherits;
    string data;
    vector<string> funcs;
    vector<string> oop;
    string viva;
    string toJson() const;
};

// ---------- Tiny JSON writer (no library needed) ----------
string jq(const string& s);                       // quote and escape a string
string jarr(const vector<string>& rawItems);      // [a,b,c] from already-built JSON items
string jstrs(const vector<string>& items);        // ["a","b"] from plain strings

class JsonObj {
    vector<pair<string, string> > kv;
public:
    JsonObj& add(const string& k, int v);
    JsonObj& add(const string& k, double v);
    JsonObj& add(const string& k, bool v);
    JsonObj& add(const string& k, const string& v);
    JsonObj& add(const string& k, const char* v);
    JsonObj& raw(const string& k, const string& json);
    string str() const;
};

// ---------- Tiny request reader for flat JSON like {"dir":"up","ids":[1,2]} ----------
string reqStr(const string& body, const string& key, const string& def = "");
int reqInt(const string& body, const string& key, int def = 0);
vector<int> reqInts(const string& body, const string& key);

// ---------- Binary helpers: write field by field, never raw objects ----------
void writeInt(ostream& out, int v);
int readInt(istream& in);                         // throws SaveCorruptedException on a short read
void writeStr(ostream& out, const string& s);     // length + bytes
string readStr(istream& in);
