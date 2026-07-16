// --- IMPORTS ---


#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <queue>
#include <algorithm>

using namespace std;

// --- RUNTIME ---
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
    size_t i = 0;
    while (i < str.length()) {
        if (str[i] == '[') {
            if (i > 0 && str[i-1] == '[') { i++; continue; } // outer bracket
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


// --- USER CODE ---
class Solution { public: GraphNode* cloneGraph(GraphNode* node) { if(!node) return nullptr; unordered_map<GraphNode*, GraphNode*> copies; copies[node] = new GraphNode(node->val);
    vector<GraphNode*> q = {node};
    size_t head = 0;
    while(head < q.size()) {
        GraphNode* curr = q[head++];
        for(GraphNode* nbr : curr->neighbors) {
            if(!copies.count(nbr)) {
                copies[nbr] = new GraphNode(nbr->val);
                q.push_back(nbr);
            }
            copies[curr]->neighbors.push_back(copies[nbr]);
        }
    }
    return copies[node]; } };

// --- MAIN ---
int main() {
    string line0;
        if (getline(cin, line0)) {
            // Remove trailing CR if present on Windows host
            if (!line0.empty() && line0.back() == '\r') line0.pop_back();
        }
        Node* node = deserializeGraph(line0);
    Solution solver;
        Node* result = solver.cloneGraph(node);
    cout << serializeGraph(result) << endl;
    freeGraph(node);
    freeGraph(result);
    return 0;
}
