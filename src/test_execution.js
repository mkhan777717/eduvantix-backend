const path = require('path');
// Load env vars
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { executeCode } = require('./services/executionService');

const runTests = async () => {
  console.log('====================================================');
  console.log('  STARTING CODE EXECUTION ENGINE VERIFICATION TEST  ');
  console.log('====================================================\n');

  // Test JS Solution (Standard Input Sum of A + B)
  const jsCode = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const [a, b] = input.split(' ').map(Number);
  console.log(a + b);
}
  `;
  const jsCases = [
    { input: '2 3', expectedOutput: '5' },
    { input: '10 -2', expectedOutput: '8' }
  ];

  console.log('1. Testing JavaScript execution engine...');
  const jsResult = await executeCode('JAVASCRIPT', jsCode, jsCases);
  console.log('   Status:', jsResult.status);
  console.log('   Execution Time:', jsResult.executionTime, 'ms');
  console.log('   Error details:', jsResult.error);
  console.log('   Passed:', jsResult.status === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // Test Python Solution (Sum of A + B)
  const pyCode = `
import sys
input_data = sys.stdin.read().strip()
if input_data:
    try:
        a, b = map(int, input_data.split())
        print(a + b)
    except ValueError:
        pass
  `;
  const pyCases = [
    { input: '5 7', expectedOutput: '12' },
    { input: '0 0', expectedOutput: '0' }
  ];

  console.log('2. Testing Python execution engine...');
  const pyResult = await executeCode('PYTHON', pyCode, pyCases);
  console.log('   Status:', pyResult.status);
  console.log('   Execution Time:', pyResult.executionTime, 'ms');
  console.log('   Error details:', pyResult.error);
  console.log('   Passed:', pyResult.status === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // Test Go Solution (Sum of A + B)
  const goCode = `
package main
import (
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)
func main() {
	inputBytes, _ := io.ReadAll(os.Stdin)
	input := strings.TrimSpace(string(inputBytes))
	if input != "" {
		parts := strings.Fields(input)
		if len(parts) >= 2 {
			a, _ := strconv.Atoi(parts[0])
			b, _ := strconv.Atoi(parts[1])
			fmt.Println(a + b)
		}
	}
}
  `;
  const goCases = [
    { input: '3 4', expectedOutput: '7' },
    { input: '-1 1', expectedOutput: '0' }
  ];

  console.log('2.5. Testing Go compilation & execution...');
  const goResult = await executeCode('GO', goCode, goCases);
  console.log('   Status:', goResult.status);
  console.log('   Execution Time:', goResult.executionTime, 'ms');
  console.log('   Error details:', goResult.error);
  console.log('   Passed:', goResult.status === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // Test C++ Solution (Sum of A + B)
  const cppCode = `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
    }
    return 0;
}
  `;
  const cppCases = [
    { input: '100 200', expectedOutput: '300' },
    { input: '-5 5', expectedOutput: '0' }
  ];

  console.log('3. Testing C++ compilation & execution (requires g++ in path)...');
  const cppResult = await executeCode('CPP', cppCode, cppCases);
  console.log('   Status:', cppResult.status);
  console.log('   Execution Time:', cppResult.executionTime, 'ms');
  console.log('   Error details:', cppResult.error);
  console.log('   Passed:', cppResult.status === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // Test Time Limit Exceeded (Infinite Loop in Python)
  const infiniteLoopPyCode = `
import time
while True:
    time.sleep(0.1)
  `;
  const tceCases = [{ input: '1', expectedOutput: '1' }];

  console.log('4. Testing Time Limit Exceeded (TLE) enforcement...');
  const tleResult = await executeCode('PYTHON', infiniteLoopPyCode, tceCases);
  console.log('   Status:', tleResult.status);
  console.log('   Execution Time:', tleResult.executionTime, 'ms');
  console.log('   Passed:', tleResult.status === 'TIME_LIMIT_EXCEEDED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // Test Compilation Error in C++ (missing semicolon)
  const badCppCode = `
#include <iostream>
int main() {
    std::cout << "Missing semicolon"
    return 0;
}
  `;
  const compileErrorCases = [{ input: '1', expectedOutput: '1' }];
  
  console.log('5. Testing Compilation Error (CE) capture...');
  const ceResult = await executeCode('CPP', badCppCode, compileErrorCases);
  console.log('   Status:', ceResult.status);
  console.log('   Passed:', ceResult.status === 'COMPILATION_ERROR' ? '✅ YES' : '❌ NO');
  console.log('====================================================');
};

runTests();
