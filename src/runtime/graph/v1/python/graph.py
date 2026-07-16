import json

class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []

    @staticmethod
    def deserialize(data):
        if not data:
            return None
        adj = json.loads(data) if isinstance(data, str) else data
        if not adj:
            return None
        nodes = {i + 1: Node(i + 1) for i in range(len(adj))}
        for i, neighbors_list in enumerate(adj):
            curr_node = nodes[i + 1]
            for neighbor_val in neighbors_list:
                curr_node.neighbors.append(nodes[neighbor_val])
        return nodes[1]

    @staticmethod
    def serialize(node):
        if not node:
            return "[]"
        adj = {}
        visited = set()

        def dfs(curr):
            if not curr or curr.val in visited:
                return
            visited.add(curr.val)
            adj[curr.val] = [n.val for n in curr.neighbors]
            for neighbor in curr.neighbors:
                dfs(neighbor)

        dfs(node)
        if not adj:
            return "[]"
        
        max_val = max(adj.keys())
        res = []
        for i in range(1, max_val + 1):
            res.append(adj.get(i, []))
        return json.dumps(res, separators=(',', ':'))
