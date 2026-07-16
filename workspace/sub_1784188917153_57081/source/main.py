# --- IMPORTS ---
import sys
import json
from typing import Optional, List

# --- RUNTIME ---


# --- HELPERS ---


# --- USER CODE ---
class Solution:
    def isPrime(self, n: int) -> bool:
        return n > 1 and all(n % i for i in range(2, int(n**0.5) + 1))

# --- MAIN ---
def main():
    import sys
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        return
    lines = raw_input.splitlines()
    if len(lines) < 1:
        lines = raw_input.split()
    try:
        if len(lines) > 0:
                        n = int(lines[0].strip().strip())
        solver = Solution()
                    result = solver.isPrime(n)
        print(str(result).lower())
    except Exception as e:
      sys.stderr.write(str(e))
      sys.exit(1)

if __name__ == '__main__':
    main()
