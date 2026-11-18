#include "common.h"

string elementName(Element e) {
    static const char* names[] = {"Fire", "Ice", "Air", "Earth", "Energy", "Ghoul"};
    return names[e];
}

Element beats(Element e) {
    if (e == GHOUL) return GHOUL;
    return (Element)((e + 1) % 5);
}

Direction parseDirection(const string& s) {
    if (s == "up") return UP;
    if (s == "down") return DOWN;
    if (s == "left") return LEFT;
    if (s == "right") return RIGHT;
    throw InvalidMoveException("Unknown direction '" + s + "'");
}

string directionName(Direction d) {
    static const char* names[] = {"up", "down", "left", "right"};
    return names[d];
}

Position stepFrom(Position p, Direction d) {
    if (d == UP) return Position(p.x, p.y - 1);
    if (d == DOWN) return Position(p.x, p.y + 1);
    if (d == LEFT) return Position(p.x - 1, p.y);
    return Position(p.x + 1, p.y);
}

// ---------- Logger ----------
list<string> Logger::lines;
bool Logger::echo = true;

void Logger::log(const string& tag, const string& msg) {
    string line = "[" + tag + "] " + msg;
    lines.push_back(line);
    if (echo) cout << line << endl;
}

list<string> Logger::take() {
    list<string> out;
    out.swap(lines);
    return out;
}

// ---------- JSON writer ----------
string jq(const string& s) {
    string out = "\"";
    for (size_t i = 0; i < s.size(); i++) {
        char c = s[i];
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "";
        else if (c == '\t') out += "\\t";
        else if ((unsigned char)c < 32) out += " ";
        else out += c;
    }
    return out + "\"";
}

string jarr(const vector<string>& items) {
    string out = "[";
    for (size_t i = 0; i < items.size(); i++) {
        if (i) out += ",";
        out += items[i];
    }
    return out + "]";
}

string jstrs(const vector<string>& items) {
    vector<string> q;
    for (size_t i = 0; i < items.size(); i++) q.push_back(jq(items[i]));
    return jarr(q);
}

JsonObj& JsonObj::add(const string& k, int v) { kv.push_back(make_pair(k, to_string(v))); return *this; }
JsonObj& JsonObj::add(const string& k, double v) {
    ostringstream o;
    o.precision(3);
    o << v;
    kv.push_back(make_pair(k, o.str()));
    return *this;
}
JsonObj& JsonObj::add(const string& k, bool v) { kv.push_back(make_pair(k, v ? "true" : "false")); return *this; }
JsonObj& JsonObj::add(const string& k, const string& v) { kv.push_back(make_pair(k, jq(v))); return *this; }
JsonObj& JsonObj::add(const string& k, const char* v) { kv.push_back(make_pair(k, jq(string(v)))); return *this; }
JsonObj& JsonObj::raw(const string& k, const string& json) { kv.push_back(make_pair(k, json)); return *this; }

string JsonObj::str() const {
    string out = "{";
    for (size_t i = 0; i < kv.size(); i++) {
        if (i) out += ",";
        out += jq(kv[i].first) + ":" + kv[i].second;
    }
    return out + "}";
}

string OOPCard::toJson() const {
    JsonObj o;
    o.add("title", title).add("badge", badge).add("classLine", classLine);
    o.add("inherits", inherits).add("data", data).add("viva", viva);
    o.raw("funcs", jstrs(funcs)).raw("oop", jstrs(oop));
    return o.str();
}

// ---------- Request reader ----------
static size_t findValue(const string& body, const string& key) {
    size_t p = body.find("\"" + key + "\"");
    if (p == string::npos) return string::npos;
    p = body.find(':', p);
    if (p == string::npos) return string::npos;
    p++;
    while (p < body.size() && (body[p] == ' ' || body[p] == '\n')) p++;
    return p;
}

string reqStr(const string& body, const string& key, const string& def) {
    size_t p = findValue(body, key);
    if (p == string::npos || p >= body.size() || body[p] != '"') return def;
    size_t e = body.find('"', p + 1);
    if (e == string::npos) return def;
    return body.substr(p + 1, e - p - 1);
}

int reqInt(const string& body, const string& key, int def) {
    size_t p = findValue(body, key);
    if (p == string::npos) return def;
    return atoi(body.c_str() + p);
}

vector<int> reqInts(const string& body, const string& key) {
    vector<int> out;
    size_t p = findValue(body, key);
    if (p == string::npos || body[p] != '[') return out;
    size_t e = body.find(']', p);
    string inner = body.substr(p + 1, e - p - 1);
    stringstream ss(inner);
    string tok;
    while (getline(ss, tok, ',')) out.push_back(atoi(tok.c_str()));
    return out;
}

// ---------- Binary helpers ----------
void writeInt(ostream& out, int v) {
    out.write((const char*)&v, sizeof(int));
}

int readInt(istream& in) {
    int v = 0;
    in.read((char*)&v, sizeof(int));
    if (!in) throw SaveCorruptedException("Save file ended early");
    return v;
}

void writeStr(ostream& out, const string& s) {
    writeInt(out, (int)s.size());
    out.write(s.data(), (streamsize)s.size());
}

string readStr(istream& in) {
    int n = readInt(in);
    if (n < 0 || n > 4096) throw SaveCorruptedException("Bad string length in save file");
    string s(n, ' ');
    if (n > 0) in.read(&s[0], n);
    if (!in) throw SaveCorruptedException("Save file ended early");
    return s;
}
