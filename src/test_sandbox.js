const path = require('path');
// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('./prisma');
const { judgeQueuedSubmission } = require('./legacy/judgeService');

const runVerificationTests = async () => {
  console.log('====================================================');
  console.log('  VERIFYING DOCKER SANDBOX & JUDGE SERVICE ENGINE   ');
  console.log('====================================================\n');

  // 1. Fetch Two Sum Problem and Test Cases from Database
  const problem = await prisma.problem.findFirst({
    where: { slug: 'two-sum' },
    include: { testCases: true },
  });

  if (!problem) {
    console.error('❌ Error: Two Sum problem (slug: "two-sum") not found in database. Seed the database first.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Testing against Problem: "${problem.title}"`);
  console.log(`Difficulty: ${problem.difficulty}, Timeout: ${problem.timeout}ms, Memory: ${problem.memoryLimit}MB`);
  console.log(`Total Test Cases in DB: ${problem.testCases.length}\n`);

  // --- JS CORRECT SOLUTION ---
  const jsCorrectCode = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const lines = input.split('\\n');
  const nums = lines[0].split(' ').map(Number);
  const target = parseInt(lines[1], 10);
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const comp = target - nums[i];
    if (map.has(comp)) {
      console.log(map.get(comp) + ' ' + i);
      process.exit(0);
    }
    map.set(nums[i], i);
  }
}
  `;

  console.log('1. Evaluating Correct JavaScript Solution...');
  const jsResult = await judgeQueuedSubmission('JAVASCRIPT', jsCorrectCode, problem, problem.testCases);
  console.log('   Verdict:', jsResult.verdict);
  console.log('   Passed Testcases:', `${jsResult.passedTestCases}/${jsResult.totalTestCases}`);
  console.log('   Execution Time:', jsResult.executionTimeMs, 'ms');
  console.log('   Passed:', jsResult.verdict === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  if (jsResult.results) {
    console.log('   Results Details:', JSON.stringify(jsResult.results, null, 2));
  }
  console.log('----------------------------------------------------');

  // --- PYTHON CORRECT SOLUTION ---
  const pyCorrectCode = `
import sys
lines = sys.stdin.read().strip().split('\\n')
if len(lines) >= 2:
    nums = list(map(int, lines[0].split()))
    target = int(lines[1])
    seen = {}
    for i, num in enumerate(nums):
        comp = target - num
        if comp in seen:
            print(f"{seen[comp]} {i}")
            sys.exit(0)
        seen[num] = i
  `;

  console.log('2. Evaluating Correct Python Solution...');
  const pyResult = await judgeQueuedSubmission('PYTHON', pyCorrectCode, problem, problem.testCases);
  console.log('   Verdict:', pyResult.verdict);
  console.log('   Passed Testcases:', `${pyResult.passedTestCases}/${pyResult.totalTestCases}`);
  console.log('   Execution Time:', pyResult.executionTimeMs, 'ms');
  console.log('   Passed:', pyResult.verdict === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  if (pyResult.results) {
    console.log('   Results Details:', JSON.stringify(pyResult.results, null, 2));
  }
  console.log('----------------------------------------------------');

  // --- GO CORRECT SOLUTION ---
  const goCorrectCode = `
package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return
	}
	line1 := scanner.Text()
	if !scanner.Scan() {
		return
	}
	line2 := scanner.Text()

	var nums []int
	for _, s := range strings.Fields(line1) {
		val, _ := strconv.Atoi(s)
		nums = append(nums, val)
	}
	target, _ := strconv.Atoi(strings.TrimSpace(line2))

	seen := make(map[int]int)
	for i, num := range nums {
		comp := target - num
		if idx, found := seen[comp]; found {
			fmt.Printf("%d %d\\n", idx, i)
			return
		}
		seen[num] = i
	}
}
  `;

  console.log('2.2. Evaluating Correct Go Solution...');
  const goResult = await judgeQueuedSubmission('GO', goCorrectCode, problem, problem.testCases);
  console.log('   Verdict:', goResult.verdict);
  console.log('   Passed Testcases:', `${goResult.passedTestCases}/${goResult.totalTestCases}`);
  console.log('   Execution Time:', goResult.executionTimeMs, 'ms');
  console.log('   Passed:', goResult.verdict === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  if (goResult.stderr) {
    console.log('   Error Details:\n', goResult.stderr);
  }
  if (goResult.results) {
    console.log('   Results Details:', JSON.stringify(goResult.results, null, 2));
  }
  console.log('----------------------------------------------------');

  // --- JAVA CORRECT SOLUTION ---
  const javaCorrectCode = `
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line1 = br.readLine();
        if (line1 == null) return;
        String line2 = br.readLine();
        if (line2 == null) return;
        
        String[] parts = line1.trim().split("\\\\s+");
        int[] nums = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            nums[i] = Integer.parseInt(parts[i]);
        }
        int target = Integer.parseInt(line2.trim());
        
        HashMap<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int comp = target - nums[i];
            if (map.containsKey(comp)) {
                System.out.println(map.get(comp) + " " + i);
                return;
            }
            map.put(nums[i], i);
        }
    }
}
  `;

  console.log('2.5. Evaluating Correct Java Solution...');
  const javaResult = await judgeQueuedSubmission('JAVA', javaCorrectCode, problem, problem.testCases);
  console.log('   Verdict:', javaResult.verdict);
  console.log('   Passed Testcases:', `${javaResult.passedTestCases}/${javaResult.totalTestCases}`);
  console.log('   Execution Time:', javaResult.executionTimeMs, 'ms');
  console.log('   Passed:', javaResult.verdict === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  if (javaResult.results) {
    console.log('   Results Details:', JSON.stringify(javaResult.results, null, 2));
  }
  console.log('----------------------------------------------------');

  // --- C++ CORRECT SOLUTION ---
  const cppCorrectCode = `
#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;
int main() {
    int val;
    vector<int> nums;
    while (cin >> val) {
        nums.push_back(val);
        if (cin.peek() == '\\n') break;
    }
    int target;
    cin >> target;
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        int comp = target - nums[i];
        if (seen.count(comp)) {
            cout << seen[comp] << " " << i << endl;
            return 0;
        }
        seen[nums[i]] = i;
    }
    return 0;
}
  `;

  console.log('3. Evaluating Correct C++ Solution...');
  const cppResult = await judgeQueuedSubmission('CPP', cppCorrectCode, problem, problem.testCases);
  console.log('   Verdict:', cppResult.verdict);
  console.log('   Passed Testcases:', `${cppResult.passedTestCases}/${cppResult.totalTestCases}`);
  console.log('   Execution Time:', cppResult.executionTimeMs, 'ms');
  console.log('   Passed:', cppResult.verdict === 'ACCEPTED' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // --- WRONG ANSWER TEST ---
  const wrongCode = `
console.log("-1 -1");
  `;
  console.log('4. Evaluating Incorrect JavaScript Solution (Wrong Answer expectation)...');
  const wrongResult = await judgeQueuedSubmission('JAVASCRIPT', wrongCode, problem, problem.testCases);
  console.log('   Verdict:', wrongResult.verdict);
  console.log('   Passed Testcases:', `${wrongResult.passedTestCases}/${wrongResult.totalTestCases}`);
  console.log('   Failed Test Case Index:', wrongResult.failedTestCase);
  console.log('   Passed:', wrongResult.verdict === 'WRONG_ANSWER' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // --- RUNTIME ERROR TEST ---
  const badRuntimeCode = `
throw new Error("Simulated Runtime Crash!");
  `;
  console.log('5. Evaluating Failing JavaScript Solution (Runtime Error expectation)...');
  const reResult = await judgeQueuedSubmission('JAVASCRIPT', badRuntimeCode, problem, problem.testCases);
  console.log('   Verdict:', reResult.verdict);
  console.log('   Passed Testcases:', `${reResult.passedTestCases}/${reResult.totalTestCases}`);
  console.log('   Passed:', reResult.verdict === 'RUNTIME_ERROR' ? '✅ YES' : '❌ NO');
  console.log('----------------------------------------------------');

  // --- COMPILATION ERROR TEST ---
  const badCppCode = `
#include <iostream>
int main() {
    std::cout << "Missing semicolon"
    return 0;
}
  `;
  console.log('6. Evaluating Failing C++ Solution (Compilation Error expectation)...');
  const ceResult = await judgeQueuedSubmission('CPP', badCppCode, problem, problem.testCases);
  console.log('   Verdict:', ceResult.verdict);
  console.log('   Passed:', ceResult.verdict === 'COMPILATION_ERROR' ? '✅ YES' : '❌ NO');
  if (ceResult.stderr) {
    console.log('   Captured Stderr:\n', ceResult.stderr.trim());
  }
  console.log('====================================================');

  await prisma.$disconnect();
};

runVerificationTests().catch(async (e) => {
  console.error('Unhandled Verification error:', e);
  await prisma.$disconnect();
});
