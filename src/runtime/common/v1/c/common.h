#ifndef OJ_COMMON_H
#define OJ_COMMON_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

static inline char* cleanString(const char* str) {
    if (!str) return NULL;
    char* s = strdup(str);
    char* start = s;
    while (*start == ' ' || *start == '"') start++;
    size_t len = strlen(start);
    while (len > 0 && (start[len-1] == ' ' || start[len-1] == '"' || start[len-1] == '\r' || start[len-1] == '\n')) {
        start[len-1] = '\0';
        len = strlen(start);
    }
    char* res = strdup(start);
    free(s);
    return res;
}

static inline int readInt() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        return atoi(line);
    }
    return 0;
}

static inline long readLong() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        return atol(line);
    }
    return 0L;
}

static inline long long readLongLong() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        return atoll(line);
    }
    return 0LL;
}

static inline double readDouble() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        return atof(line);
    }
    return 0.0;
}

static inline float readFloat() {
    return (float)readDouble();
}

static inline char readChar() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        char* p = line;
        while (*p == ' ') p++;
        if (*p == '\'' || *p == '"') {
            return p[1];
        }
        return *p;
    }
    return '\0';
}

static inline bool readBool() {
    char line[128];
    if (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len-1] == '\n' || line[len-1] == '\r' || line[len-1] == ' ')) {
            line[len-1] = '\0';
            len--;
        }
        char* p = line;
        while (*p == ' ') p++;
        return (strcmp(p, "true") == 0 || strcmp(p, "1") == 0);
    }
    return false;
}

static inline char* readString() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len-1] == '\n' || line[len-1] == '\r')) {
            line[len-1] = '\0';
            len--;
        }
        return cleanString(line);
    }
    return NULL;
}

static inline char* serializeInt(int val) {
    char buf[32];
    sprintf(buf, "%d", val);
    return strdup(buf);
}

static inline char* serializeLong(long val) {
    char buf[32];
    sprintf(buf, "%ld", val);
    return strdup(buf);
}

static inline char* serializeLongLong(long long val) {
    char buf[40];
    sprintf(buf, "%lld", val);
    return strdup(buf);
}

static inline char* serializeDouble(double val) {
    char buf[64];
    sprintf(buf, "%f", val);
    size_t len = strlen(buf);
    while (len > 1 && buf[len-1] == '0' && buf[len-2] != '.') {
        buf[len-1] = '\0';
        len--;
    }
    return strdup(buf);
}

static inline char* serializeChar(char val) {
    char buf[4];
    sprintf(buf, "%c", val);
    return strdup(buf);
}

static inline char* serializeBool(bool val) {
    return strdup(val ? "true" : "false");
}

#endif // OJ_COMMON_H
