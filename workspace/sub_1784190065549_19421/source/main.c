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


// --- USER CODE ---
struct Node* cloneGraph(struct Node* node) { if(!node) return NULL; struct Node* copies[1000] = {NULL}; copies[node->val] = createGraphNode(node->val);
    struct Node* q[1000];
    q[0] = node;
    int head = 0, tail = 1;
    while(head < tail) {
        struct Node* curr = q[head++];
        for(int i=0; i<curr->neighborsCount; i++) {
            struct Node* nbr = curr->neighbors[i];
            if(!copies[nbr->val]) {
                copies[nbr->val] = createGraphNode(nbr->val);
                q[tail++] = nbr;
            }
            addNeighbor(copies[curr->val], copies[nbr->val]);
        }
    }
    return copies[node->val]; }

// --- MAIN ---
int main() {
    static char line0[1048576];
        if (fgets(line0, sizeof(line0), stdin)) {
            size_t len = strlen(line0);
            if (len > 0 && line0[len-1] == '\n') line0[len-1] = '\0';
            if (len > 1 && line0[len-2] == '\r') line0[len-2] = '\0';
        }
        struct Node* node = deserializeGraph(line0);
    struct Node* result = cloneGraph(node);
    printf("%s\n", serializeGraph(result));
    freeGraph(node);
    freeGraph(result);
    return 0;
}
