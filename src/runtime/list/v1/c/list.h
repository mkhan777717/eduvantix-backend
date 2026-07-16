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

#endif // OJ_LIST_H
