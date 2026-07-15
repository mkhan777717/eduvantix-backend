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
    str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
    std::stringstream ss(str);
    std::string temp;
    while(std::getline(ss, temp, ',')) {
        if(!temp.empty()) res.push_back(std::stoi(temp));
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

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for(int i = 0; i < nums.size(); i++) {
            for(int j = i + 1; j < nums.size(); j++) {
                if(nums[i] + nums[j] == target) return {i, j};
            }
        }
        return {};
    }
};

// --- MAIN ---
int main() {
    string line0;
    if (getline(cin, line0)) {
        // Remove trailing CR if present on Windows host
        if (!line0.empty() && line0.back() == '\r') line0.pop_back();
    }
    vector<int> nums = parseVectorInt(line0);
    string line1;
    if (getline(cin, line1)) {
        // Remove trailing CR if present on Windows host
        if (!line1.empty() && line1.back() == '\r') line1.pop_back();
    }
    int target = stoi(line1);
    Solution solver;
    vector<int> result = solver.twoSum(nums, target);
    cout << serializeVectorInt(result) << endl;
    
    return 0;
}
