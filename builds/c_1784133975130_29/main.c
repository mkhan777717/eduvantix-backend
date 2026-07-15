// --- IMPORTS ---
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

// --- RUNTIME ---
#ifndef OJ_LIST_H
#define OJ_LIST_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

struct ListNode {
    int val;
    struct ListNode *next;
};

// Vector definitions
struct VectorInt {
    int* data;
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

struct MatrixInt {
    struct VectorInt* data;
    int size;
};

struct MatrixString {
    struct VectorString* data;
    int size;
};

// Primitive String parsing helpers
static inline char* cleanString(const char* str) {
    if (!str) return NULL;
    char* s = strdup(str);
    char* start = s;
    while (*start == ' ' || *start == '\"') start++;
    size_t len = strlen(start);
    while (len > 0 && (start[len-1] == ' ' || start[len-1] == '\"' || start[len-1] == '\r' || start[len-1] == '\n')) {
        start[len-1] = '\0';
        len = strlen(start);
    }
    char* res = strdup(start);
    free(s);
    return res;
}

static inline char* serializeInt(int val) {
    char buf[32];
    sprintf(buf, "%d", val);
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

    char* token = strtok(clean, ",");
    while (token != NULL) {
        if (res.size >= capacity) {
            capacity *= 2;
            res.data = (int*)realloc(res.data, capacity * sizeof(int));
        }
        res.data[res.size++] = atoi(token);
        token = strtok(NULL, ",");
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

// Float, String, and Bool vectors (empty stubs or generic parsers to pass type verification compilation)
static inline struct VectorFloat parseVectorFloat(const char* input_str) {
    struct VectorFloat res = { NULL, 0 };
    return res;
}
static inline char* serializeVectorFloat(struct VectorFloat vec) {
    return strdup("[]");
}
static inline void freeVectorFloat(struct VectorFloat vec) {}

static inline struct VectorString parseVectorString(const char* input_str) {
    struct VectorString res = { NULL, 0 };
    return res;
}
static inline char* serializeVectorString(struct VectorString vec) {
    return strdup("[]");
}
static inline void freeVectorString(struct VectorString vec) {}

static inline struct VectorBool parseVectorBool(const char* input_str) {
    struct VectorBool res = { NULL, 0 };
    return res;
}
static inline char* serializeVectorBool(struct VectorBool vec) {
    return strdup("[]");
}
static inline void freeVectorBool(struct VectorBool vec) {}

static inline struct MatrixInt parseMatrixInt(const char* input_str) {
    struct MatrixInt res = { NULL, 0 };
    return res;
}
static inline char* serializeMatrixInt(struct MatrixInt mat) {
    return strdup("[]");
}
static inline void freeMatrixInt(struct MatrixInt mat) {}

static inline struct MatrixString parseMatrixString(const char* input_str) {
    struct MatrixString res = { NULL, 0 };
    return res;
}
static inline char* serializeMatrixString(struct MatrixString mat) {
    return strdup("[]");
}
static inline void freeMatrixString(struct MatrixString mat) {}

#endif // OJ_LIST_H


// --- HELPERS ---


// --- USER CODE ---

struct VectorInt twoSum(struct VectorInt nums, int target) {
    struct VectorInt res = { NULL, 0 };
    for(int i = 0; i < nums.size; i++) {
        for(int j = i + 1; j < nums.size; j++) {
            if(nums.data[i] + nums.data[j] == target) {
                res.data = (int*)malloc(2 * sizeof(int));
                res.data[0] = i;
                res.data[1] = j;
                res.size = 2;
                return res;
            }
        }
    }
    return res;
}

// --- MAIN ---
int main() {
    char line0[1048576];
    if (fgets(line0, sizeof(line0), stdin)) {
        size_t len = strlen(line0);
        if (len > 0 && line0[len-1] == '\n') line0[len-1] = '\0';
        if (len > 1 && line0[len-2] == '\r') line0[len-2] = '\0';
    }
    struct VectorInt nums = parseVectorInt(line0);
    char line1[1048576];
    if (fgets(line1, sizeof(line1), stdin)) {
        size_t len = strlen(line1);
        if (len > 0 && line1[len-1] == '\n') line1[len-1] = '\0';
        if (len > 1 && line1[len-2] == '\r') line1[len-2] = '\0';
    }
    int target = atoi(line1);
    struct VectorInt result = twoSum(nums, target);
    printf("%s\n", serializeVectorInt(result));
    freeVectorInt(nums);
    freeVectorInt(result);
    return 0;
}
