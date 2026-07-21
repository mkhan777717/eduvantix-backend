#ifndef OJ_LIST_H
#define OJ_LIST_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

struct ListNode {
    int val;
    struct ListNode *next;
};

// Vector definitions
struct VectorInt {
    int* data;
    int size;
};

struct VectorLong {
    long* data;
    int size;
};

struct VectorDouble {
    double* data;
    int size;
};

struct VectorFloat {
    double* data;
    int size;
};

struct VectorString {
    char** data;
    int size;
};

struct VectorBool {
    bool* data;
    int size;
};

struct VectorChar {
    char* data;
    int size;
};

struct MatrixInt {
    struct VectorInt* data;
    int size;
};

struct MatrixString {
    struct VectorString* data;
    int size;
};

// Helper for string cleaning
static inline char* cleanStringList(const char* str) {
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

// Primitive String parsing helpers

static inline struct ListNode* deserializeList(const char* input_str) {
    if (!input_str) return NULL;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return NULL;
    }

    struct ListNode* head = NULL;
    struct ListNode* tail = NULL;
    char* token = strtok(clean, ",");
    while (token != NULL) {
        struct ListNode* node = (struct ListNode*)malloc(sizeof(struct ListNode));
        node->val = atoi(token);
        node->next = NULL;
        if (!head) {
            head = node;
            tail = node;
        } else {
            tail->next = node;
            tail = node;
        }
        token = strtok(NULL, ",");
    }
    free(str);
    return head;
}

static inline char* serializeList(struct ListNode* head) {
    if (!head) return strdup("[]");
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    while (head) {
        char buf[32];
        sprintf(buf, "%d", head->val);
        strcat(res, buf);
        if (head->next) strcat(res, ",");
        head = head->next;
    }
    strcat(res, "]");
    return res;
}

static inline void freeList(struct ListNode* head) {
    while (head) {
        struct ListNode* temp = head;
        head = head->next;
        free(temp);
    }
}

// Vector Parsers
static inline struct VectorInt parseVectorInt(const char* input_str) {
    struct VectorInt res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 1000;
    res.data = (int*)malloc(capacity * sizeof(int));

    char* token = strtok(clean, ", \t\n\r");
    while (token != NULL) {
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (int*)realloc(res.data, capacity * sizeof(int));
        }
        res.data[res.size++] = atoi(token);
        token = strtok(NULL, ", \t\n\r");
    }
    free(str);
    return res;
}

static inline char* serializeVectorInt(struct VectorInt vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        char buf[32];
        sprintf(buf, "%d", vec.data[i]);
        strcat(res, buf);
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorInt(struct VectorInt vec) {
    if (vec.data) free(vec.data);
}

// Long Vector
static inline struct VectorLong parseVectorLong(const char* input_str) {
    struct VectorLong res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 1000;
    res.data = (long*)malloc(capacity * sizeof(long));

    char* token = strtok(clean, ", \t\n\r");
    while (token != NULL) {
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (long*)realloc(res.data, capacity * sizeof(long));
        }
        res.data[res.size++] = atol(token);
        token = strtok(NULL, ", \t\n\r");
    }
    free(str);
    return res;
}

static inline char* serializeVectorLong(struct VectorLong vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        char buf[32];
        sprintf(buf, "%ld", vec.data[i]);
        strcat(res, buf);
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorLong(struct VectorLong vec) {
    if (vec.data) free(vec.data);
}

// Double Vector
static inline struct VectorDouble parseVectorDouble(const char* input_str) {
    struct VectorDouble res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 1000;
    res.data = (double*)malloc(capacity * sizeof(double));

    char* token = strtok(clean, ", \t\n\r");
    while (token != NULL) {
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (double*)realloc(res.data, capacity * sizeof(double));
        }
        res.data[res.size++] = atof(token);
        token = strtok(NULL, ", \t\n\r");
    }
    free(str);
    return res;
}

static inline char* serializeVectorDouble(struct VectorDouble vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        char buf[64];
        sprintf(buf, "%f", vec.data[i]);
        size_t len = strlen(buf);
        while (len > 1 && buf[len-1] == '0' && buf[len-2] != '.') {
            buf[len-1] = '\0';
            len--;
        }
        strcat(res, buf);
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorDouble(struct VectorDouble vec) {
    if (vec.data) free(vec.data);
}

// Float Vector
static inline struct VectorFloat parseVectorFloat(const char* input_str) {
    struct VectorDouble dvec = parseVectorDouble(input_str);
    struct VectorFloat res = { dvec.data, dvec.size };
    return res;
}

static inline char* serializeVectorFloat(struct VectorFloat vec) {
    struct VectorDouble dvec = { vec.data, vec.size };
    return serializeVectorDouble(dvec);
}

static inline void freeVectorFloat(struct VectorFloat vec) {
    if (vec.data) free(vec.data);
}

// Char Vector
static inline struct VectorChar parseVectorChar(const char* input_str) {
    struct VectorChar res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 1000;
    res.data = (char*)malloc(capacity * sizeof(char));

    char* token = strtok(clean, ",");
    while (token != NULL) {
        char* t = token;
        while (*t == ' ' || *t == '"' || *t == '\'') t++;
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (char*)realloc(res.data, capacity * sizeof(char));
        }
        res.data[res.size++] = *t;
        token = strtok(NULL, ",");
    }
    free(str);
    return res;
}

static inline char* serializeVectorChar(struct VectorChar vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        strcat(res, "\"");
        char buf[2] = { vec.data[i], '\0' };
        strcat(res, buf);
        strcat(res, "\"");
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorChar(struct VectorChar vec) {
    if (vec.data) free(vec.data);
}

// String Vector
static inline struct VectorString parseVectorString(const char* input_str) {
    struct VectorString res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 100;
    res.data = (char**)malloc(capacity * sizeof(char*));

    char* token = strtok(clean, ",");
    while (token != NULL) {
        char* cleaned = cleanStringList(token);
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (char**)realloc(res.data, capacity * sizeof(char*));
        }
        res.data[res.size++] = cleaned;
        token = strtok(NULL, ",");
    }
    free(str);
    return res;
}

static inline char* serializeVectorString(struct VectorString vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        strcat(res, "\"");
        strcat(res, vec.data[i]);
        strcat(res, "\"");
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorString(struct VectorString vec) {
    if (vec.data) {
        for (int i = 0; i < vec.size; i++) {
            free(vec.data[i]);
        }
        free(vec.data);
    }
}

// Bool Vector
static inline struct VectorBool parseVectorBool(const char* input_str) {
    struct VectorBool res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0) {
        free(str);
        return res;
    }

    int capacity = 1000;
    res.data = (bool*)malloc(capacity * sizeof(bool));

    char* token = strtok(clean, ", \t\n\r");
    while (token != NULL) {
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (bool*)realloc(res.data, capacity * sizeof(bool));
        }
        res.data[res.size++] = (strcmp(token, "true") == 0 || strcmp(token, "1") == 0);
        token = strtok(NULL, ", \t\n\r");
    }
    free(str);
    return res;
}

static inline char* serializeVectorBool(struct VectorBool vec) {
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < vec.size; i++) {
        strcat(res, vec.data[i] ? "true" : "false");
        if (i + 1 < vec.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeVectorBool(struct VectorBool vec) {
    if (vec.data) free(vec.data);
}

// Matrix Int
static inline struct MatrixInt parseMatrixInt(const char* input_str) {
    struct MatrixInt res = { NULL, 0 };
    if (!input_str) return res;
    char* str = strdup(input_str);
    int len = strlen(str);
    while (len > 0 && (str[len-1] == ' ' || str[len-1] == '\r' || str[len-1] == '\n')) {
        str[len-1] = '\0';
        len--;
    }
    if (len < 2 || str[0] != '[' || str[len-1] != ']') {
        free(str);
        return res;
    }
    
    memmove(str, str + 1, len - 1);
    str[len - 2] = '\0';
    
    int cap = 10;
    res.data = (struct VectorInt*)malloc(cap * sizeof(struct VectorInt));
    
    int i = 0;
    while (str[i] != '\0') {
        if (str[i] == '[') {
            int end = i;
            while (str[end] != '\0' && str[end] != ']') {
                end++;
            }
            if (str[end] == ']') {
                int subLen = end - i + 1;
                char* sub = (char*)malloc(subLen + 1);
                strncpy(sub, str + i, subLen);
                sub[subLen] = '\0';
                
                if (res.size >= cap) {
                    cap *= 2;
                    res.data = (struct VectorInt*)realloc(res.data, cap * sizeof(struct VectorInt));
                }
                res.data[res.size++] = parseVectorInt(sub);
                free(sub);
                i = end + 1;
            } else {
                break;
            }
        } else {
            i++;
        }
    }
    free(str);
    return res;
}

static inline char* serializeMatrixInt(struct MatrixInt mat) {
    if (!mat.data) return strdup("[]");
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < mat.size; i++) {
        char* vecStr = serializeVectorInt(mat.data[i]);
        strcat(res, vecStr);
        free(vecStr);
        if (i + 1 < mat.size) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeMatrixInt(struct MatrixInt mat) {
    if (mat.data) {
        for (int i = 0; i < mat.size; i++) {
            freeVectorInt(mat.data[i]);
        }
        free(mat.data);
    }
}

static inline struct MatrixString parseMatrixString(const char* input_str) {
    struct MatrixString res = { NULL, 0 };
    return res;
}
static inline char* serializeMatrixString(struct MatrixString mat) {
    return strdup("[]");
}
static inline void freeMatrixString(struct MatrixString mat) {}

// Array and list helper reader functions
#ifdef OJ_LIST_H
static inline struct VectorInt readIntArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorInt(line);
    }
    struct VectorInt empty = {NULL, 0};
    return empty;
}

static inline struct VectorLong readLongArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorLong(line);
    }
    struct VectorLong empty = {NULL, 0};
    return empty;
}

static inline struct VectorDouble readDoubleArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorDouble(line);
    }
    struct VectorDouble empty = {NULL, 0};
    return empty;
}

static inline struct VectorChar readCharArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorChar(line);
    }
    struct VectorChar empty = {NULL, 0};
    return empty;
}

static inline struct VectorString readStringArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorString(line);
    }
    struct VectorString empty = {NULL, 0};
    return empty;
}

static inline struct VectorBool readBoolArray() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseVectorBool(line);
    }
    struct VectorBool empty = {NULL, 0};
    return empty;
}

static inline struct ListNode* readLinkedList() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return deserializeList(line);
    }
    return NULL;
}

static inline struct MatrixInt readIntMatrix() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseMatrixInt(line);
    }
    struct MatrixInt empty = {NULL, 0};
    return empty;
}

static inline struct MatrixString readStringMatrix() {
    static char line[1048576];
    if (fgets(line, sizeof(line), stdin)) {
        return parseMatrixString(line);
    }
    struct MatrixString empty = {NULL, 0};
    return empty;
}
#endif

#endif // OJ_LIST_H
