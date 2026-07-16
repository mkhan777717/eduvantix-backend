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

inline std::vector<std::string> parseVectorString(std::string str) {
    std::vector<std::string> res;
    while (!str.empty() && isspace(str.front())) str.erase(str.begin());
    while (!str.empty() && isspace(str.back())) str.pop_back();
    if (str.length() < 2 || str.front() != '[' || str.back() != ']') return res;
    str = str.substr(1, str.length() - 2);

    std::stringstream ss(str);
    std::string token;
    while (std::getline(ss, token, ',')) {
        while (!token.empty() && (isspace(token.front()) || token.front() == '"')) token.erase(token.begin());
        while (!token.empty() && (isspace(token.back()) || token.back() == '"')) token.pop_back();
        res.push_back(token);
    }
    return res;
}

inline std::string serializeVectorString(const std::vector<std::string>& vec) {
    std::string res = "[";
    for (size_t i = 0; i < vec.size(); i++) {
        res += "\"" + vec[i] + "\"";
        if (i + 1 < vec.size()) res += ",";
    }
    res += "]";
    return res;
}

#endif // OJ_LIST_HPP
