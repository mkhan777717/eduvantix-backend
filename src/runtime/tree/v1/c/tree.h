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
