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
        return json.dumps(res, separators=(',', ':'))
