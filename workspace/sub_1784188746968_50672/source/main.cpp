// --- IMPORTS ---


#include <iostream>
#include <string>
#include <vector>
#include <sstream>
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


#ifndef OJ_LIST_HPP
#define OJ_LIST_HPP

#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>

struct ListNode {
    int val;
    ListNode *next;
    ListNode(int x) : val(x), next(NULL) {}
};

inline ListNode* deserializeList(std::string str) {
    str.erase(std::remove(str.begin(), str.end(), '['), str.end());
    str.erase(std::remove(str.begin(), str.end(), ']'), str.end());
    str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
    if (str.empty()) return nullptr;

    std::stringstream ss(str);
    std::string token;
    ListNode* head = nullptr;
    ListNode* tail = nullptr;

    while (std::getline(ss, token, ',')) {
        if (!token.empty()) {
            ListNode* node = new ListNode(std::stoi(token));
            if (!head) {
                head = node;
                tail = node;
            } else {
                tail->next = node;
                tail = node;
            }
        }
    }
    return head;
}

inline std::string serializeList(ListNode* head) {
    if (!head) return "[]";
    std::string res = "[";
    while (head) {
        res += std::to_string(head->val);
        if (head->next) res += ",";
        head = head->next;
    }
    res += "]";
    return res;
}

inline void freeList(ListNode* head) {
    while (head) {
        ListNode* temp = head;
        head = head->next;
        delete temp;
    }
}

// Helper Array Int parsing
inline std::vector<int> parseVectorInt(std::string str) {
    std::vector<int> res;
    str.erase(std::remove(str.begin(), str.end(), '['), str.end());
    str.erase(std::remove(str.begin(), str.end(), ']'), str.end());
    std::replace(str.begin(), str.end(), ',', ' ');
    std::stringstream ss(str);
    int val;
    while (ss >> val) {
        res.push_back(val);
    }
    return res;
}

inline std::string serializeVectorInt(const std::vector<int>& vec) {
    std::string res = "[";
    for (size_t i = 0; i < vec.size(); i++) {
        res += std::to_string(vec[i]);
        if (i + 1 < vec.size()) res += ",";
    }
    res += "]";
    return res;
}

inline std::vector<std::vector<int>> parseMatrixInt(std::string str) {
    std::vector<std::vector<int>> res;
    while (!str.empty() && isspace(str.front())) str.erase(str.begin());
    while (!str.empty() && isspace(str.back())) str.pop_back();
    if (str.length() < 2 || str.front() != '[' || str.back() != ']') return res;
    str = str.substr(1, str.length() - 2);

    size_t i = 0;
    while (i < str.length()) {
        if (str[i] == '[') {
            size_t end = str.find(']', i);
            if (end != std::string::npos) {
                std::string sub = str.substr(i, end - i + 1);
                res.push_back(parseVectorInt(sub));
                i = end + 1;
            } else {
                break;
            }
        } else {
            i++;
        }
    }
    return res;
}

inline std::string serializeMatrixInt(const std::vector<std::vector<int>>& mat) {
    std::string res = "[";
    for (size_t i = 0; i < mat.size(); i++) {
        res += serializeVectorInt(mat[i]);
        if (i + 1 < mat.size()) res += ",";
    }
    res += "]";
    return res;
}

#endif // OJ_LIST_HPP


#ifndef OJ_GRAPH_HPP
#define OJ_GRAPH_HPP

#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <queue>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>

class Node {
public:
    int val;
    std::vector<Node*> neighbors;
    Node() { val = 0; neighbors = std::vector<Node*>(); }
    Node(int _val) { val = _val; neighbors = std::vector<Node*>(); }
    Node(int _val, std::vector<Node*> _neighbors) { val = _val; neighbors = _neighbors; }
};

inline std::vector<std::vector<int>> parseAdjacencyList(std::string str) {
    std::vector<std::vector<int>> res;
    while (!str.empty() && isspace(str.front())) str.erase(str.begin());
    while (!str.empty() && isspace(str.back())) str.pop_back();
    if (str.length() < 2 || str.front() != '[' || str.back() != ']') return res;
    str = str.substr(1, str.length() - 2);

    size_t i = 0;
    while (i < str.length()) {
        if (str[i] == '[') {
            size_t end = str.find(']', i);
            if (end != std::string::npos) {
                std::string sub = str.substr(i + 1, end - i - 1);
                std::stringstream ss(sub);
                std::string temp;
                std::vector<int> nodeNeighbors;
                while (std::getline(ss, temp, ',')) {
                    if (!temp.empty()) nodeNeighbors.push_back(std::stoi(temp));
                }
                res.push_back(nodeNeighbors);
                i = end + 1;
            } else {
                break;
            }
        } else {
            i++;
        }
    }
    return res;
}

inline Node* deserializeGraph(std::string str) {
    if (str.empty() || str == "[]" || str == "null") return nullptr;
    std::vector<std::vector<int>> adj = parseAdjacencyList(str);
    if (adj.empty()) return nullptr;

    std::unordered_map<int, Node*> nodeMap;
    for (size_t u = 1; u <= adj.size(); u++) {
        nodeMap[u] = new Node(u);
    }

    for (size_t u = 1; u <= adj.size(); u++) {
        for (int neighborVal : adj[u - 1]) {
            nodeMap[u]->neighbors.push_back(nodeMap[neighborVal]);
        }
    }
    return nodeMap[1];
}

inline void serializeGraphDFS(Node* node, std::unordered_map<int, std::vector<int>>& adj, std::unordered_set<int>& visited) {
    if (!node || visited.count(node->val)) return;
    visited.insert(node->val);
    std::vector<int> neighbors;
    for (Node* neighbor : node->neighbors) {
        neighbors.push_back(neighbor->val);
    }
    adj[node->val] = neighbors;
    for (Node* neighbor : node->neighbors) {
        serializeGraphDFS(neighbor, adj, visited);
    }
}

inline std::string serializeGraph(Node* node) {
    if (!node) return "[]";
    std::unordered_map<int, std::vector<int>> adj;
    std::unordered_set<int> visited;
    serializeGraphDFS(node, adj, visited);

    if (adj.empty()) return "[]";
    
    int maxVal = 0;
    for (auto const& [key, val] : adj) {
        maxVal = std::max(maxVal, key);
    }

    std::string res = "[";
    for (int i = 1; i <= maxVal; i++) {
        res += "[";
        if (adj.count(i)) {
            for (size_t j = 0; j < adj[i].size(); j++) {
                res += std::to_string(adj[i][j]);
                if (j + 1 < adj[i].size()) res += ",";
            }
        }
        res += "]";
        if (i < maxVal) res += ",";
    }
    res += "]";
    return res;
}

inline void freeGraph(Node* node) {
    if (!node) return;
    std::queue<Node*> q;
    q.push(node);
    std::unordered_set<Node*> visited;
    visited.insert(node);
    
    std::vector<Node*> allNodes;

    while(!q.empty()) {
        Node* curr = q.front();
        q.pop();
        allNodes.push_back(curr);
        for(Node* neighbor : curr->neighbors) {
            if(!visited.count(neighbor)) {
                visited.insert(neighbor);
                q.push(neighbor);
            }
        }
    }

    for (Node* n : allNodes) {
        delete n;
    }
}

#endif // OJ_GRAPH_HPP


// --- HELPERS ---

vector<vector<string>> parseMatrixString(string str) {
    vector<vector<string>> res;
    if (str.empty()) return res;
    if (str.front() == '[') str = str.substr(1);
    if (str.back() == ']') str.pop_back();
    size_t i = 0;
    while (i < str.length()) {
        while (i < str.length() && str[i] != '[') i++;
        if (i >= str.length()) break;
        size_t start = i + 1;
        while (i < str.length() && str[i] != ']') i++;
        size_t end = i;
        string sub = str.substr(start, end - start);
        vector<string> argList;
        stringstream ss(sub);
        string token;
        while (getline(ss, token, ',')) {
            while (!token.empty() && (isspace(token.front()) || token.front() == '"')) token.erase(token.begin());
            while (!token.empty() && (isspace(token.back()) || token.back() == '"')) token.pop_back();
            argList.push_back(token);
        }
        res.push_back(argList);
        i = end + 1;
    }
    return res;
}


// --- USER CODE ---

#include <unordered_map>
#include <list>
using namespace std;
class LRUCache {
    int cap;
    list<pair<int, int>> l;
    unordered_map<int, list<pair<int, int>>::iterator> m;
public:
    LRUCache(int capacity) { cap = capacity; }
    int get(int key) {
        if (!m.count(key)) return -1;
        l.splice(l.begin(), l, m[key]);
        return m[key]->second;
    }
    void put(int key, int value) {
        if (m.count(key)) {
            l.splice(l.begin(), l, m[key]);
            m[key]->second = value;
            return;
        }
        if (l.size() == cap) {
            auto d_key = l.back().first;
            l.pop_back();
            m.erase(d_key);
        }
        l.push_front({key, value});
        m[key] = l.begin();
    }
};

// --- MAIN ---
int main() {
    string line0, line1;
    getline(cin, line0);
    getline(cin, line1);
    vector<string> operations = parseVectorString(line0);
    vector<vector<string>> args = parseMatrixString(line1);
    LRUCache* obj = nullptr;
    vector<string> results;
    for (size_t i = 0; i < operations.size(); i++) {
        string op = operations[i];
        vector<string> arg = args[i];
        if (i == 0) {
            obj = new LRUCache(stoi(arg[0]));
            results.push_back("null");
        } else {
            if (op == "get") {
                auto res = obj->get(stoi(arg[0]));
                results.push_back(to_string(res));
            }
            else if (op == "put") {
                obj->put(stoi(arg[0]), stoi(arg[1]));
                results.push_back("null");
            }
            else { results.push_back("null"); }
        }
    }
    cout << "[";
    for (size_t idx = 0; idx < results.size(); idx++) {
        if (idx > 0) cout << ",";
        cout << results[idx];
    }
    cout << "]" << endl;
    delete obj;
    return 0;
}
