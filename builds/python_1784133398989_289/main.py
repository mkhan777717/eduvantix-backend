# --- IMPORTS ---
import sys
import json

# --- RUNTIME ---


# --- HELPERS ---


# --- USER CODE ---

class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []

# --- MAIN ---
def main():
    import sys
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        return
    lines = raw_input.splitlines()
    try:
          if len(lines) > 0:
        nums = json.loads(lines[0].strip().strip())
        if len(lines) > 1:
        target = int(lines[1].strip().strip())
        solver = Solution()
        result = solver.twoSum(nums, target)
          print(json.dumps(result))
    except Exception as e:
          sys.stderr.write(str(e))
          sys.exit(1)

if __name__ == '__main__':
    main()
