// templates.h - class templates and function templates.
#pragma once
#include "common.h"

// Same container logic for Slug*, Item and Keystone, written once.
template <class T>
class Inventory {
    vector<T> things;
public:
    void add(const T& t) { things.push_back(t); }
    void removeAt(int i) {
        if (i < 0 || i >= (int)things.size()) throw GameException("Inventory index out of range");
        things.erase(things.begin() + i);
    }
    T& operator[](int i) {
        if (i < 0 || i >= (int)things.size()) throw GameException("Inventory index out of range");
        return things[i];
    }
    const T& operator[](int i) const {
        if (i < 0 || i >= (int)things.size()) throw GameException("Inventory index out of range");
        return things[i];
    }
    int size() const { return (int)things.size(); }
    bool empty() const { return things.empty(); }
    void clear() { things.clear(); }
    vector<T>& all() { return things; }
    const vector<T>& all() const { return things; }
};

// name -> object lookup
template <class T>
class Registry {
    map<string, T> entries;
public:
    void add(const string& name, const T& t) { entries[name] = t; }
    bool has(const string& name) const { return entries.count(name) > 0; }
    T get(const string& name) const {
        typename map<string, T>::const_iterator it = entries.find(name);
        if (it == entries.end()) throw GameException("Nothing called '" + name + "'");
        return it->second;
    }
    const map<string, T>& all() const { return entries; }
};

// keeps a number inside a range (int or float)
template <class T>
T clampValue(T v, T lo, T hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

// largest element of a vector
template <class T>
T findMax(const vector<T>& v) {
    T best = v[0];
    for (size_t i = 1; i < v.size(); i++)
        if (v[i] > best) best = v[i];
    return best;
}
