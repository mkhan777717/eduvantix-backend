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
class Solution { public: string intToRoman(int num) { string M[] = {"", "M", "MM", "MMM"}; string C[] = {"", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"}; string X[] = {"", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"}; string I[] = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"}; string res = ""; while(num >= 1000) { res += "M"; num -= 1000; } return res + C[(num%1000)/100] + X[(num%100)/10] + I[num%10]; } };

// --- MAIN ---
int main() {
    string line0;
        if (getline(cin, line0)) {
            // Remove trailing CR if present on Windows host
            if (!line0.empty() && line0.back() == '\r') line0.pop_back();
        }
        int num = stoi(line0);
    Solution solver;
        string result = solver.intToRoman(num);
    cout << result << endl;
    return 0;
}
