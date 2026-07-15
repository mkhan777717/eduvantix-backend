// --- IMPORTS ---


#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <queue>
#include <algorithm>

using namespace std;

// --- RUNTIME ---
#ifndef OJ_TREE_HPP
#define OJ_TREE_HPP

#include <iostream>
#include <vector>
#include <string>
#include <queue>
#include <sstream>
#include <algorithm>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int x) : val(x), left(NULL), right(NULL) {}
};

inline TreeNode* deserializeTree(std::string str) {
    str.erase(std::remove(str.begin(), str.end(), '['), str.end());
    str.erase(std::remove(str.begin(), str.end(), ']'), str.end());
    str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
    if (str.empty()) return nullptr;

    std::vector<std::string> tokens;
    std::stringstream ss(str);
    std::string token;
    while (std::getline(ss, token, ',')) {
        tokens.push_back(token);
    }
    if (tokens.empty() || tokens[0] == "null" || tokens[0].empty()) return nullptr;

    TreeNode* root = new TreeNode(std::stoi(tokens[0]));
    std::queue<TreeNode*> q;
    q.push(root);

    size_t i = 1;
    while (!q.empty() && i < tokens.size()) {
        TreeNode* curr = q.front();
        q.pop();

        if (i < tokens.size()) {
            if (tokens[i] != "null" && !tokens[i].empty()) {
                curr->left = new TreeNode(std::stoi(tokens[i]));
                q.push(curr->left);
            }
            i++;
        }
        if (i < tokens.size()) {
            if (tokens[i] != "null" && !tokens[i].empty()) {
                curr->right = new TreeNode(std::stoi(tokens[i]));
                q.push(curr->right);
            }
            i++;
        }
    }
    return root;
}

inline std::string serializeTree(TreeNode* root) {
    if (!root) return "[]";
    std::string res = "[";
    std::queue<TreeNode*> q;
    q.push(root);
    std::vector<std::string> nodes;

    while (!q.empty()) {
        TreeNode* curr = q.front();
        q.pop();
        if (curr) {
            nodes.push_back(std::to_string(curr->val));
            q.push(curr->left);
            q.push(curr->right);
        } else {
            nodes.push_back("null");
        }
    }

    while (!nodes.empty() && nodes.back() == "null") {
        nodes.pop_back();
    }

    for (size_t i = 0; i < nodes.size(); i++) {
        res += nodes[i];
        if (i + 1 < nodes.size()) res += ",";
    }
    res += "]";
    return res;
}

inline void freeTree(TreeNode* root) {
    if (!root) return;
    freeTree(root->left);
    freeTree(root->right);
    delete root;
}

#endif // OJ_TREE_HPP


// --- HELPERS ---


// --- USER CODE ---

class Solution {
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        if (!p && !q) return true;
        if (!p || !q) return false;
        return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
    }
};

// --- MAIN ---
int main() {
    string line0;
    if (getline(cin, line0)) {
        // Remove trailing CR if present on Windows host
        if (!line0.empty() && line0.back() == '\r') line0.pop_back();
    }
    TreeNode* p = deserializeTree(line0);
    string line1;
    if (getline(cin, line1)) {
        // Remove trailing CR if present on Windows host
        if (!line1.empty() && line1.back() == '\r') line1.pop_back();
    }
    TreeNode* q = deserializeTree(line1);
    Solution solver;
    bool result = solver.isSameTree(p, q);
    cout << (result ? "true" : "false") << endl;
    freeTree(p);
    freeTree(q);
    return 0;
}
