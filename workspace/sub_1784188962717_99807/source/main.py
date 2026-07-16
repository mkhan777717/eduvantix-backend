# --- IMPORTS ---
import sys
import json
from typing import Optional, List

# --- RUNTIME ---
import json

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    @staticmethod
    def deserialize(data):
        if not data:
            return None
        arr = json.loads(data) if isinstance(data, str) else data
        if not arr:
            return None
        head = ListNode(int(arr[0]))
        curr = head
        for val in arr[1:]:
            curr.next = ListNode(int(val))
            curr = curr.next
        return head

    @staticmethod
    def serialize(head):
        if not head:
            return "[]"
        res = []
        curr = head
        while curr:
            res.append(curr.val)
            curr = curr.next
        return json.dumps(res)


# --- HELPERS ---


# --- USER CODE ---
class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev

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
            head = ListNode.deserialize(json.loads(lines[0].strip()))
        solver = Solution()
        result = solver.reverseList(head)
        print(ListNode.serialize(result))
    except Exception as e:
      sys.stderr.write(str(e))
      sys.exit(1)

if __name__ == '__main__':
    main()
