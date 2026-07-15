# --- IMPORTS ---
import sys
import json

# --- RUNTIME ---
import json
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    @staticmethod
    def deserialize(data):
        if not data:
            return None
        # Handle parsed list or raw string
        tokens = json.loads(data) if isinstance(data, str) else data
        if not tokens or tokens[0] is None:
            return None

        root = TreeNode(int(tokens[0]))
        q = deque([root])
        i = 1
        while q and i < len(tokens):
            curr = q.popleft()
            if i < len(tokens):
                if tokens[i] is not None and str(tokens[i]) != 'null':
                    curr.left = TreeNode(int(tokens[i]))
                    q.append(curr.left)
                i += 1
            if i < len(tokens):
                if tokens[i] is not None and str(tokens[i]) != 'null':
                    curr.right = TreeNode(int(tokens[i]))
                    q.append(curr.right)
                i += 1
        return root

    @staticmethod
    def serialize(root):
        if not root:
            return "[]"
        res = []
        q = deque([root])
        while q:
            curr = q.popleft()
            if curr:
                res.append(curr.val)
                q.append(curr.left)
                q.append(curr.right)
            else:
                res.append(None)
        
        while res and res[-1] is None:
            res.pop()
        
        # Format matching JSON standard (lowercase null)
        return json.dumps(res)


# --- HELPERS ---


# --- USER CODE ---

class Solution:
    def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:
        if not p and not q:
            return True
        if not p or not q:
            return False
        return p.val == q.val and self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)

# --- MAIN ---
def main():
    import sys
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        return
    lines = raw_input.splitlines()
    try:
            if len(lines) > 0:
                p = TreeNode.deserialize(json.loads(lines[0].strip()))
            if len(lines) > 1:
                q = TreeNode.deserialize(json.loads(lines[1].strip()))
            solver = Solution()
            result = solver.isSameTree(p, q)
            print(str(result).lower())
    except Exception as e:
          sys.stderr.write(str(e))
          sys.exit(1)

if __name__ == '__main__':
    main()
