// --- IMPORTS ---
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

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

// --- RUNTIME ---
#ifndef OJ_TREE_H
#define OJ_TREE_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

static inline struct TreeNode* deserializeTree(const char* input_str) {
    if (!input_str) return NULL;
    char* str = strdup(input_str);
    char* clean = str;
    while (*clean == '[' || *clean == ' ') clean++;
    size_t len = strlen(clean);
    while (len > 0 && (clean[len-1] == ']' || clean[len-1] == ' ' || clean[len-1] == '\n' || clean[len-1] == '\r')) {
        clean[len-1] = '\0';
        len = strlen(clean);
    }
    if (len == 0 || strcmp(clean, "null") == 0) {
        free(str);
        return NULL;
    }

    char* tokens[10000];
    int tokenCount = 0;
    char* token = strtok(clean, ",");
    while (token != NULL) {
        while (*token == ' ') token++;
        size_t tLen = strlen(token);
        while (tLen > 0 && token[tLen-1] == ' ') { token[tLen-1] = '\0'; tLen--; }
        
        tokens[tokenCount++] = token;
        token = strtok(NULL, ",");
    }

    if (tokenCount == 0 || strcmp(tokens[0], "null") == 0 || strlen(tokens[0]) == 0) {
        free(str);
        return NULL;
    }

    struct TreeNode* root = (struct TreeNode*)malloc(sizeof(struct TreeNode));
    root->val = atoi(tokens[0]);
    root->left = NULL;
    root->right = NULL;

    struct TreeNode* q[10000];
    int head = 0, tail = 0;
    q[tail++] = root;

    int i = 1;
    while (head < tail && i < tokenCount) {
        struct TreeNode* curr = q[head++];
        if (i < tokenCount) {
            if (strcmp(tokens[i], "null") != 0 && strlen(tokens[i]) > 0) {
                struct TreeNode* left = (struct TreeNode*)malloc(sizeof(struct TreeNode));
                left->val = atoi(tokens[i]);
                left->left = NULL;
                left->right = NULL;
                curr->left = left;
                q[tail++] = left;
            }
            i++;
        }
        if (i < tokenCount) {
            if (strcmp(tokens[i], "null") != 0 && strlen(tokens[i]) > 0) {
                struct TreeNode* right = (struct TreeNode*)malloc(sizeof(struct TreeNode));
                right->val = atoi(tokens[i]);
                right->left = NULL;
                right->right = NULL;
                curr->right = right;
                q[tail++] = right;
            }
            i++;
        }
    }

    free(str);
    return root;
}

static inline char* serializeTree(struct TreeNode* root) {
    if (!root) return strdup("[]");
    
    char* nodes[10000];
    int nodeCount = 0;
    
    struct TreeNode* q[20000];
    int head = 0, tail = 0;
    q[tail++] = root;

    while (head < tail) {
        struct TreeNode* curr = q[head++];
        if (curr) {
            char buf[32];
            sprintf(buf, "%d", curr->val);
            nodes[nodeCount++] = strdup(buf);
            q[tail++] = curr->left;
            q[tail++] = curr->right;
        } else {
            nodes[nodeCount++] = strdup("null");
        }
    }

    while (nodeCount > 0 && strcmp(nodes[nodeCount - 1], "null") == 0) {
        free(nodes[nodeCount - 1]);
        nodeCount--;
    }

    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 0; i < nodeCount; i++) {
        strcat(res, nodes[i]);
        free(nodes[i]);
        if (i + 1 < nodeCount) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeTree(struct TreeNode* root) {
    if (!root) return;
    freeTree(root->left);
    freeTree(root->right);
    free(root);
}

#endif // OJ_TREE_H


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


#ifndef OJ_GRAPH_H
#define OJ_GRAPH_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

struct Node {
    int val;
    struct Node** neighbors;
    int neighborsCount;
};

static inline struct Node* createGraphNode(int val) {
    struct Node* node = (struct Node*)malloc(sizeof(struct Node));
    node->val = val;
    node->neighbors = NULL;
    node->neighborsCount = 0;
    return node;
}

static inline void addNeighbor(struct Node* node, struct Node* neighbor) {
    if (!node || !neighbor) return;
    node->neighbors = (struct Node**)realloc(node->neighbors, (node->neighborsCount + 1) * sizeof(struct Node*));
    node->neighbors[node->neighborsCount++] = neighbor;
}

static inline struct Node* deserializeGraph(const char* input_str) {
    if (!input_str || strcmp(input_str, "[]") == 0 || strcmp(input_str, "null") == 0 || strlen(input_str) == 0) return NULL;

    char* str = strdup(input_str);
    int slen = strlen(str);
    while (slen > 0 && (str[slen-1] == ' ' || str[slen-1] == '\r' || str[slen-1] == '\n')) {
        str[slen-1] = '\0';
        slen--;
    }
    if (slen < 2 || str[0] != '[' || str[slen-1] != ']') {
        free(str);
        return NULL;
    }
    memmove(str, str + 1, slen - 1);
    str[slen - 2] = '\0';

    int nodeCount = 0;
    for (int j = 0; str[j] != '\0'; j++) {
        if (str[j] == '[') {
            nodeCount++;
        }
    }
    
    if (nodeCount == 0) {
        free(str);
        return NULL;
    }

    struct Node** allNodes = (struct Node**)malloc(nodeCount * sizeof(struct Node*));
    for (int j = 0; j < nodeCount; j++) {
        allNodes[j] = (struct Node*)malloc(sizeof(struct Node));
        allNodes[j]->val = j + 1;
        allNodes[j]->neighbors = NULL;
        allNodes[j]->neighborsCount = 0;
    }

    int u = 0;
    int j = 0;
    while (str[j] != '\0' && u < nodeCount) {
        if (str[j] == '[') {
            size_t subLen = 0;
            while (str[j + 1 + subLen] != '\0' && str[j + 1 + subLen] != ']') {
                subLen++;
            }
            
            char* sub = (char*)malloc(subLen + 1);
            strncpy(sub, str + j + 1, subLen);
            sub[subLen] = '\0';
            
            int neighborsCap = 10;
            allNodes[u]->neighbors = (struct Node**)malloc(neighborsCap * sizeof(struct Node*));
            
            char* token = strtok(sub, ",");
            while (token != NULL) {
                int neighborVal = atoi(token);
                if (neighborVal >= 1 && neighborVal <= nodeCount) {
                    if (allNodes[u]->neighborsCount >= neighborsCap) {
                        neighborsCap *= 2;
                        allNodes[u]->neighbors = (struct Node**)realloc(allNodes[u]->neighbors, neighborsCap * sizeof(struct Node*));
                    }
                    allNodes[u]->neighbors[allNodes[u]->neighborsCount++] = allNodes[neighborVal - 1];
                }
                token = strtok(NULL, ",");
            }
            free(sub);
            u++;
            j = j + subLen + 2;
        } else {
            j++;
        }
    }

    struct Node* root = allNodes[0];
    free(allNodes);
    free(str);
    return root;
}

static inline void serializeGraphDFS(struct Node* node, int** adj, int* adjSizes, bool* visited) {
    if (!node || visited[node->val]) return;
    visited[node->val] = true;
    
    adjSizes[node->val] = node->neighborsCount;
    adj[node->val] = (int*)malloc(node->neighborsCount * sizeof(int));
    for (int i = 0; i < node->neighborsCount; i++) {
        adj[node->val][i] = node->neighbors[i]->val;
    }
    
    for (int i = 0; i < node->neighborsCount; i++) {
        serializeGraphDFS(node->neighbors[i], adj, adjSizes, visited);
    }
}

static inline char* serializeGraph(struct Node* node) {
    if (!node) return strdup("[]");
    
    int* adj[10000];
    int adjSizes[10000];
    bool visited[10000];
    memset(adj, 0, sizeof(adj));
    memset(adjSizes, 0, sizeof(adjSizes));
    memset(visited, 0, sizeof(visited));
    
    serializeGraphDFS(node, adj, adjSizes, visited);
    
    int maxVal = 0;
    for (int i = 1; i < 10000; i++) {
        if (visited[i]) maxVal = i;
    }
    
    if (maxVal == 0) return strdup("[]");
    
    char* res = (char*)malloc(1048576);
    strcpy(res, "[");
    for (int i = 1; i <= maxVal; i++) {
        strcat(res, "[");
        if (visited[i] && adj[i]) {
            for (int j = 0; j < adjSizes[i]; j++) {
                char buf[32];
                sprintf(buf, "%d", adj[i][j]);
                strcat(res, buf);
                if (j + 1 < adjSizes[i]) strcat(res, ",");
            }
            free(adj[i]);
        }
        strcat(res, "]");
        if (i < maxVal) strcat(res, ",");
    }
    strcat(res, "]");
    return res;
}

static inline void freeGraph(struct Node* node) {
    if (!node) return;
    
    struct Node* q[10000];
    int head = 0, tail = 0;
    q[tail++] = node;
    
    struct Node* visited[10000];
    int visitedCount = 0;
    visited[visitedCount++] = node;
    
    while (head < tail) {
        struct Node* curr = q[head++];
        for (int i = 0; i < curr->neighborsCount; i++) {
            bool found = false;
            for (int i_v = 0; i_v < visitedCount; i_v++) {
                if (visited[i_v] == curr->neighbors[i]) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                visited[visitedCount++] = curr->neighbors[i];
                q[tail++] = curr->neighbors[i];
            }
        }
    }
    
    for (int i_n = 0; i_n < visitedCount; i_n++) {
        if (visited[i_n]->neighbors) free(visited[i_n]->neighbors);
        free(visited[i_n]);
    }
}

#endif // OJ_GRAPH_H


// --- HELPERS ---

void parseOpsC(char* str, char*** ops, int* len) {
    int cap = 16;
    *ops = malloc(sizeof(char*) * cap);
    int count = 0;
    char* p = str;
    while (*p) {
        if (*p == '"') {
            char* start = p + 1;
            char* end = strchr(start, '"');
            if (end) {
                int l = end - start;
                char* val = malloc(l + 1);
                strncpy(val, start, l);
                val[l] = '\0';
                if (count >= cap) {
                    cap *= 2;
                    *ops = realloc(*ops, sizeof(char*) * cap);
                }
                (*ops)[count++] = val;
                p = end + 1;
                continue;
            }
        }
        p++;
    }
    *len = count;
}
void parseArgsC(char* str, char**** args, int** cols, int* len) {
    int cap = 16;
    *args = malloc(sizeof(char**) * cap);
    *cols = malloc(sizeof(int) * cap);
    int count = 0;
    char* p = str;
    if (*p == '[') p++;
    while (*p) {
        while (*p && *p != '[') {
            if (*p == ']') break;
            p++;
        }
        if (*p == ']' || !*p) break;
        p++; 
        char* start = p;
        char* end = strchr(start, ']');
        if (!end) break;
        int l = end - start;
        char* sub = malloc(l + 1);
        strncpy(sub, start, l);
        sub[l] = '\0';
        
        int sub_cap = 4;
        char** sub_args = malloc(sizeof(char*) * sub_cap);
        int sub_count = 0;
        char* tok = strtok(sub, ",");
        while (tok) {
            while (*tok && (isspace(*tok) || *tok == '"')) tok++;
            int tok_l = strlen(tok);
            while (tok_l > 0 && (isspace(tok[tok_l - 1]) || tok[tok_l - 1] == '"')) {
                tok[tok_l - 1] = '\0';
                tok_l--;
            }
            if (sub_count >= sub_cap) {
                sub_cap *= 2;
                sub_args = realloc(sub_args, sizeof(char*) * sub_cap);
            }
            sub_args[sub_count++] = strdup(tok);
            tok = strtok(NULL, ",");
        }
        free(sub);
        if (count >= cap) {
            cap *= 2;
            *args = realloc(*args, sizeof(char**) * cap);
            *cols = realloc(*cols, sizeof(int) * cap);
        }
        (*args)[count] = sub_args;
        (*cols)[count] = sub_count;
        count++;
        p = end + 1;
    }
    *len = count;
}


// --- USER CODE ---

#include <stdio.h>
#include <stdlib.h>
typedef struct {
    int key;
    int value;
    int age;
} LRUNode;
typedef struct {
    int capacity;
    int count;
    int time;
    LRUNode* nodes;
} LRUCache;
void* lRUCacheCreate(int capacity) {
    LRUCache* obj = malloc(sizeof(LRUCache));
    obj->capacity = capacity;
    obj->count = 0;
    obj->time = 0;
    obj->nodes = malloc(sizeof(LRUNode) * capacity);
    return obj;
}
int lRUCacheGet(void* cache, int key) {
    LRUCache* obj = (LRUCache*)cache;
    obj->time++;
    for(int i=0; i<obj->count; i++) {
        if (obj->nodes[i].key == key) {
            obj->nodes[i].age = obj->time;
            return obj->nodes[i].value;
        }
    }
    return -1;
}
void lRUCachePut(void* cache, int key, int value) {
    LRUCache* obj = (LRUCache*)cache;
    obj->time++;
    for(int i=0; i<obj->count; i++) {
        if (obj->nodes[i].key == key) {
            obj->nodes[i].age = obj->time;
            obj->nodes[i].value = value;
            return;
        }
    }
    if (obj->count < obj->capacity) {
        obj->nodes[obj->count].key = key;
        obj->nodes[obj->count].value = value;
        obj->nodes[obj->count].age = obj->time;
        obj->count++;
    } else {
        int oldest_idx = 0;
        int oldest_age = obj->nodes[0].age;
        for(int i=1; i<obj->count; i++) {
            if (obj->nodes[i].age < oldest_age) {
                oldest_age = obj->nodes[i].age;
                oldest_idx = i;
            }
        }
        obj->nodes[oldest_idx].key = key;
        obj->nodes[oldest_idx].value = value;
        obj->nodes[oldest_idx].age = obj->time;
    }
}
void lRUCacheFree(void* cache) {
    LRUCache* obj = (LRUCache*)cache;
    free(obj->nodes);
    free(obj);
}


// --- MAIN ---
int main() {
    static char line0[1048576];
    static char line1[1048576];
    if (fgets(line0, sizeof(line0), stdin)) {}
    if (fgets(line1, sizeof(line1), stdin)) {}
    char** operations = NULL;
    int operations_len = 0;
    parseOpsC(line0, &operations, &operations_len);
    char*** args = NULL;
    int* args_cols = NULL;
    int args_len = 0;
    parseArgsC(line1, &args, &args_cols, &args_len);
    void* obj = NULL;
    char** results = malloc(sizeof(char*) * operations_len);
    for (int i = 0; i < operations_len; i++) {
        char* op = operations[i];
        if (i == 0) {
            obj = lRUCacheCreate(atoi(args[0][0]));
            results[0] = strdup("null");
        } else {
            if (strcmp(op, "get") == 0) {
                int res = lRUCacheGet(obj, atoi(args[i][0]));
                char buf[32];
                sprintf(buf, "%d", res);
                results[i] = strdup(buf);
            }
            else if (strcmp(op, "put") == 0) {
                lRUCachePut(obj, atoi(args[i][0]), atoi(args[i][1]));
                results[i] = strdup("null");
            }
            else { results[i] = strdup("null"); }
        }
    }
    printf("[");
    for (int i = 0; i < operations_len; i++) {
        if (i > 0) printf(",");
        printf("%s", results[i]);
        free(results[i]);
    }
    printf("]\n");
    free(results);
    if (obj) { lRUCacheFree(obj); }
    return 0;
}
