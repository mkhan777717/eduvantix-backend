// --- IMPORTS ---


#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <queue>
#include <algorithm>

using namespace std;

// --- RUNTIME ---


// --- HELPERS ---


// --- USER CODE ---
#include <string>
using namespace std;

int solve(string haystack, string needle) {
    if (needle.empty())
        return 0;

    int n = haystack.size();
    int m = needle.size();

    for (int i = 0; i <= n - m; i++) {
        int j = 0;

        while (j < m && haystack[i + j] == needle[j]) {
            j++;
        }

        if (j == m)
            return i;
    }

    return -1;
}

// --- MAIN ---
int main() {
    string line0;
        if (getline(cin, line0)) {
            // Remove trailing CR if present on Windows host
            if (!line0.empty() && line0.back() == '\r') line0.pop_back();
        }
        string haystack = line0;
    string line1;
        if (getline(cin, line1)) {
            // Remove trailing CR if present on Windows host
            if (!line1.empty() && line1.back() == '\r') line1.pop_back();
        }
        string needle = line1;
    int result = solve(haystack, needle);
    cout << to_string(result) << endl;
    return 0;
}
