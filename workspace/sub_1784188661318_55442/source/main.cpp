// --- IMPORTS ---


#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <queue>
#include <algorithm>

using namespace std;

// --- RUNTIME ---
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

#endif // OJ_LIST_HPP


// --- HELPERS ---


// --- USER CODE ---
class Solution { void dfs(vector<vector<int>>& grid, int r, int c) {
        if(r<0||r>=grid.size()||c<0||c>=grid[0].size()||grid[r][c]!=1) return;
        grid[r][c] = 0;
        dfs(grid,r+1,c); dfs(grid,r-1,c); dfs(grid,r,c+1); dfs(grid,r,c-1);
    } public: int numIslands(vector<vector<int>>& grid) {
        int count=0; for(int i=0;i<grid.size();i++) for(int j=0;j<grid[0].size();j++) if(grid[i][j]==1) { count++; dfs(grid,i,j); } return count; } };

// --- MAIN ---
int main() {
    string line0;
        if (getline(cin, line0)) {
            // Remove trailing CR if present on Windows host
            if (!line0.empty() && line0.back() == '\r') line0.pop_back();
        }
        vector<vector<int>> grid = parseMatrixInt(line0);
    Solution solver;
        int result = solver.numIslands(grid);
    cout << to_string(result) << endl;
    return 0;
}
