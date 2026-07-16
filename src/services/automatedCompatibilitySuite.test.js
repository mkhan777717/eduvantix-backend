const assert = require('assert');
const assemblyEngine = require('./assemblyEngine');
const executionEngine = require('./execution/executionEngine');

const solutions = {
  isPrime: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'n', type: 'INT' }],
      returnType: 'BOOLEAN',
      functionName: 'isPrime'
    },
    inputs: ['7\n', '4\n'],
    expected: ['true\n', 'false\n'],
    code: {
      cpp: `class Solution { public: bool isPrime(int n) { if (n < 2) return false; for (int i = 2; i * i <= n; i++) { if (n % i == 0) return false; } return true; } };`,
      python: `class Solution:\n    def isPrime(self, n: int) -> bool:\n        return n > 1 and all(n % i for i in range(2, int(n**0.5) + 1))`,
      javascript: `function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) { if (n % i === 0) return false; } return true; }`,
      java: `class Solution { public boolean isPrime(int n) { if (n < 2) return false; for (int i = 2; i * i <= n; i++) { if (n % i == 0) return false; } return true; } }`,
      go: `func isPrime(n int) bool { if n < 2 { return false }; for i := 2; i * i <= n; i++ { if n % i == 0 { return false } }; return true }`,
      c: `bool isPrime(int n) { if (n < 2) return false; for (int i = 2; i * i <= n; i++) { if (n % i == 0) return false; } return true; }`
    }
  },
  twoSum: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'nums', type: 'ARRAY_INT' },
        { name: 'target', type: 'INT' }
      ],
      returnType: 'ARRAY_INT',
      functionName: 'twoSum'
    },
    inputs: ['[2,7,11,15]\n9\n'],
    expected: ['[0,1]\n'],
    code: {
      cpp: `class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { for(int i=0; i<nums.size(); i++) for(int j=i+1; j<nums.size(); j++) if(nums[i]+nums[j]==target) return {i, j}; return {}; } };`,
      python: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        for i in range(len(nums)):\n            for j in range(i+1, len(nums)):\n                if nums[i] + nums[j] == target: return [i, j]\n        return []`,
      javascript: `function twoSum(nums, target) { for(let i=0; i<nums.length; i++) for(let j=i+1; j<nums.length; j++) if(nums[i]+nums[j]===target) return [i, j]; return []; }`,
      java: `class Solution { public int[] twoSum(int[] nums, int target) { for(int i=0; i<nums.length; i++) for(int j=i+1; j<nums.length; j++) if(nums[i]+nums[j]==target) return new int[]{i, j}; return new int[0]; } }`,
      go: `func twoSum(nums []int, target int) []int { for i:=0; i<len(nums); i++ { for j:=i+1; j<len(nums); j++ { if nums[i]+nums[j] == target { return []int{i, j} } } }; return []int{} }`,
      c: `struct VectorInt twoSum(struct VectorInt nums, int target) { struct VectorInt res = { NULL, 0 }; for(int i=0; i<nums.size; i++) { for(int j=i+1; j<nums.size; j++) { if(nums.data[i]+nums.data[j] == target) { res.data = malloc(2*sizeof(int)); res.data[0]=i; res.data[1]=j; res.size=2; return res; } } } return res; }`
    }
  },
  binarySearch: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'nums', type: 'ARRAY_INT' },
        { name: 'target', type: 'INT' }
      ],
      returnType: 'INT',
      functionName: 'search'
    },
    inputs: ['[-1,0,3,5,9,12]\n9\n'],
    expected: ['4\n'],
    code: {
      cpp: `class Solution { public: int search(vector<int>& nums, int target) { int l=0, r=nums.size()-1; while(l<=r) { int m=l+(r-l)/2; if(nums[m]==target) return m; if(nums[m]<target) l=m+1; else r=m-1; } return -1; } };`,
      python: `class Solution:\n    def search(self, nums: list[int], target: int) -> int:\n        l, r = 0, len(nums)-1\n        while l <= r:\n            m = (l+r)//2\n            if nums[m] == target: return m\n            elif nums[m] < target: l = m + 1\n            else: r = m - 1\n        return -1`,
      javascript: `function search(nums, target) { let l=0, r=nums.length-1; while(l<=r) { let m=Math.floor((l+r)/2); if(nums[m]===target) return m; if(nums[m]<target) l=m+1; else r=m-1; } return -1; }`,
      java: `class Solution { public int search(int[] nums, int target) { int l=0, r=nums.length-1; while(l<=r) { int m=l+(r-l)/2; if(nums[m]==target) return m; if(nums[m]<target) l=m+1; else r=m-1; } return -1; } }`,
      go: `func search(nums []int, target int) int { l, r := 0, len(nums)-1; for l<=r { m := (l+r)/2; if nums[m] == target { return m }; if nums[m] < target { l = m+1 } else { r = m-1 } }; return -1 }`,
      c: `int search(struct VectorInt nums, int target) { int l=0, r=nums.size-1; while(l<=r) { int m=l+(r-l)/2; if(nums.data[m]==target) return m; if(nums.data[m]<target) l=m+1; else r=m-1; } return -1; }`
    }
  },
  reverseList: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'head', type: 'ListNode' }],
      returnType: 'ListNode',
      functionName: 'reverseList'
    },
    inputs: ['[1,2,3]\n'],
    expected: ['[3,2,1]\n'],
    code: {
      cpp: `class Solution { public: ListNode* reverseList(ListNode* head) { ListNode* prev=nullptr; while(head) { ListNode* node=new ListNode(head->val); node->next=prev; prev=node; head=head->next; } return prev; } };`,
      python: `class Solution:\n    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:\n        prev = None\n        while head:\n            nxt = head.next\n            head.next = prev\n            prev = head\n            head = nxt\n        return prev`,
      javascript: `function reverseList(head) { let prev=null; while(head) { let nxt=head.next; head.next=prev; prev=head; head=nxt; } return prev; }`,
      java: `class Solution { public ListNode reverseList(ListNode head) { ListNode prev=null; while(head!=null) { ListNode nxt=head.next; head.next=prev; prev=head; head=nxt; } return prev; } }`,
      go: `func reverseList(head *ListNode) *ListNode { var prev *ListNode; for head != nil { nxt := head.Next; head.Next = prev; prev = head; head = nxt }; return prev }`,
      c: `struct ListNode* reverseList(struct ListNode* head) { struct ListNode* prev=NULL; while(head) { struct ListNode* node=malloc(sizeof(struct ListNode)); node->val=head->val; node->next=prev; prev=node; head=head->next; } return prev; }`
    }
  },
  mergeTwoLists: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'l1', type: 'ListNode' },
        { name: 'l2', type: 'ListNode' }
      ],
      returnType: 'ListNode',
      functionName: 'mergeTwoLists'
    },
    inputs: ['[1,2,4]\n[1,3,4]\n'],
    expected: ['[1,1,2,3,4,4]\n'],
    code: {
      cpp: `class Solution { public: ListNode* mergeTwoLists(ListNode* l1, ListNode* l2) { ListNode dummy(0); ListNode* tail = &dummy; while(l1 && l2) { if(l1->val < l2->val) { tail->next = new ListNode(l1->val); l1 = l1->next; } else { tail->next = new ListNode(l2->val); l2 = l2->next; } tail = tail->next; } while(l1) { tail->next = new ListNode(l1->val); l1 = l1->next; tail = tail->next; } while(l2) { tail->next = new ListNode(l2->val); l2 = l2->next; tail = tail->next; } return dummy.next; } };`,
      python: `class Solution:\n    def mergeTwoLists(self, l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:\n        if not l1: return l2\n        if not l2: return l1\n        if l1.val < l2.val:\n            l1.next = self.mergeTwoLists(l1.next, l2)\n            return l1\n        else:\n            l2.next = self.mergeTwoLists(l1, l2.next)\n            return l2`,
      javascript: `function mergeTwoLists(l1, l2) { if(!l1) return l2; if(!l2) return l1; if(l1.val < l2.val) { l1.next = mergeTwoLists(l1.next, l2); return l1; } else { l2.next = mergeTwoLists(l1, l2.next); return l2; } }`,
      java: `class Solution { public ListNode mergeTwoLists(ListNode l1, ListNode l2) { if(l1==null) return l2; if(l2==null) return l1; if(l1.val < l2.val) { l1.next = mergeTwoLists(l1.next, l2); return l1; } else { l2.next = mergeTwoLists(l1, l2.next); return l2; } } }`,
      go: `func mergeTwoLists(l1 *ListNode, l2 *ListNode) *ListNode { if l1 == nil { return l2 }; if l2 == nil { return l1 }; if l1.Val < l2.Val { l1.Next = mergeTwoLists(l1.Next, l2); return l1 } else { l2.Next = mergeTwoLists(l1, l2.Next); return l2 } }`,
      c: `struct ListNode* mergeTwoLists(struct ListNode* l1, struct ListNode* l2) { struct ListNode dummy; dummy.next = NULL; struct ListNode* tail = &dummy; while(l1 && l2) { struct ListNode* n = malloc(sizeof(struct ListNode)); if(l1->val < l2->val) { n->val = l1->val; l1 = l1->next; } else { n->val = l2->val; l2 = l2->next; } n->next = NULL; tail->next = n; tail = n; } while(l1) { struct ListNode* n = malloc(sizeof(struct ListNode)); n->val = l1->val; n->next = NULL; l1 = l1->next; tail->next = n; tail = n; } while(l2) { struct ListNode* n = malloc(sizeof(struct ListNode)); n->val = l2->val; n->next = NULL; l2 = l2->next; tail->next = n; tail = n; } return dummy.next; }`
    }
  },
  isSameTree: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'p', type: 'TreeNode' },
        { name: 'q', type: 'TreeNode' }
      ],
      returnType: 'BOOLEAN',
      functionName: 'isSameTree'
    },
    inputs: ['[1,2,3]\n[1,2,3]\n'],
    expected: ['true\n'],
    code: {
      cpp: `class Solution { public: bool isSameTree(TreeNode* p, TreeNode* q) { if(!p && !q) return true; if(!p || !q) return false; return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right); } };`,
      python: `class Solution:\n    def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:\n        if not p and not q: return True\n        if not p or not q: return False\n        return p.val == q.val and self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)`,
      javascript: `function isSameTree(p, q) { if(!p && !q) return true; if(!p || !q) return false; return p.val === q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right); }`,
      java: `class Solution { public boolean isSameTree(TreeNode p, TreeNode q) { if(p==null && q==null) return true; if(p==null || q==null) return false; return p.val == q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right); } }`,
      go: `func isSameTree(p *TreeNode, q *TreeNode) bool { if p == nil && q == nil { return true }; if p == nil || q == nil { return false }; return p.Val == q.Val && isSameTree(p.Left, q.Left) && isSameTree(p.Right, q.Right) }`,
      c: `bool isSameTree(struct TreeNode* p, struct TreeNode* q) { if(!p && !q) return true; if(!p || !q) return false; return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right); }`
    }
  },
  maxDepth: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'root', type: 'TreeNode' }],
      returnType: 'INT',
      functionName: 'maxDepth'
    },
    inputs: ['[3,9,20,null,null,15,7]\n'],
    expected: ['3\n'],
    code: {
      cpp: `class Solution { public: int maxDepth(TreeNode* root) { if(!root) return 0; return 1 + max(maxDepth(root->left), maxDepth(root->right)); } };`,
      python: `class Solution:\n    def maxDepth(self, root: Optional[TreeNode]) -> int:\n        return 0 if not root else 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))`,
      javascript: `function maxDepth(root) { if(!root) return 0; return 1 + Math.max(maxDepth(root.left), maxDepth(root.right)); }`,
      java: `class Solution { public int maxDepth(TreeNode root) { if(root==null) return 0; return 1 + Math.max(maxDepth(root.left), maxDepth(root.right)); } }`,
      go: `func maxDepth(root *TreeNode) int { if root == nil { return 0 }; l := maxDepth(root.Left); r := maxDepth(root.Right); if l > r { return l + 1 } else { return r + 1 } }`,
      c: `int maxDepth(struct TreeNode* root) { if(!root) return 0; int l = maxDepth(root->left); int r = maxDepth(root->right); return 1 + (l > r ? l : r); }`
    }
  },
  invertTree: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'root', type: 'TreeNode' }],
      returnType: 'TreeNode',
      functionName: 'invertTree'
    },
    inputs: ['[4,2,7]\n'],
    expected: ['[4,7,2]\n'],
    code: {
      cpp: `class Solution { public: TreeNode* invertTree(TreeNode* root) { if(!root) return nullptr; TreeNode* node = new TreeNode(root->val); node->left = invertTree(root->right); node->right = invertTree(root->left); return node; } };`,
      python: `class Solution:\n    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:\n        if not root: return None\n        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)\n        return root`,
      javascript: `function invertTree(root) { if(!root) return null; let temp = root.left; root.left = invertTree(root.right); root.right = invertTree(temp); return root; }`,
      java: `class Solution { public TreeNode invertTree(TreeNode root) { if(root==null) return null; TreeNode temp = root.left; root.left = invertTree(root.right); root.right = invertTree(temp); return root; } }`,
      go: `func invertTree(root *TreeNode) *TreeNode { if root == nil { return nil }; temp := root.Left; root.Left = invertTree(root.Right); root.Right = invertTree(temp); return root }`,
      c: `struct TreeNode* invertTree(struct TreeNode* root) { if(!root) return NULL; struct TreeNode* node = malloc(sizeof(struct TreeNode)); node->val = root->val; node->left = invertTree(root->right); node->right = invertTree(root->left); return node; }`
    }
  },
  cloneGraph: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'node', type: 'GraphNode' }],
      returnType: 'GraphNode',
      functionName: 'cloneGraph'
    },
    inputs: ['[[2],[1]]\n'],
    expected: ['[[2],[1]]\n'],
    code: {
      cpp: `class Solution { public: Node* cloneGraph(Node* node) { if(!node) return nullptr; unordered_map<Node*, Node*> copies; copies[node] = new Node(node->val);\n    vector<Node*> q = {node};\n    size_t head = 0;\n    while(head < q.size()) {\n        Node* curr = q[head++];\n        for(Node* nbr : curr->neighbors) {\n            if(!copies.count(nbr)) {\n                copies[nbr] = new Node(nbr->val);\n                q.push_back(nbr);\n            }\n            copies[curr]->neighbors.push_back(copies[nbr]);\n        }\n    }\n    return copies[node]; } };`,
      python: `class Solution:\n    def cloneGraph(self, node: Optional[Node]) -> Optional[Node]:\n        if not node: return None\n        copies = {node: Node(node.val)}\n        q = [node]\n        head = 0\n        while head < len(q):\n            curr = q[head]\n            head += 1\n            for nbr in curr.neighbors:\n                if nbr not in copies:\n                    copies[nbr] = Node(nbr.val)\n                    q.append(nbr)\n                copies[curr].neighbors.append(copies[nbr])\n        return copies[node]`,
      javascript: `function cloneGraph(node) { if(!node) return null; const copies = new Map(); copies.set(node, new Node(node.val));\n    const q = [node];\n    let head = 0;\n    while(head < q.length) {\n        const curr = q[head++];\n        for(const nbr of curr.neighbors) {\n            if(!copies.has(nbr)) {\n                copies.set(nbr, new Node(nbr.val));\n                q.push(nbr);\n            }\n            copies.get(curr).neighbors.push(copies.get(nbr));\n        }\n    }\n    return copies.get(node); }`,
      java: `class Solution { public Node cloneGraph(Node node) { if(node==null) return null; Map<Node, Node> copies = new HashMap<>(); copies.put(node, new Node(node.val));\n    List<Node> q = new ArrayList<>();\n    q.add(node);\n    int head = 0;\n    while(head < q.size()) {\n        Node curr = q.get(head++);\n        for(Node nbr : curr.neighbors) {\n            if(!copies.containsKey(nbr)) {\n                copies.put(nbr, new Node(nbr.val));\n                q.add(nbr);\n            }\n            copies.get(curr).neighbors.add(copies.get(nbr));\n        }\n    }\n    return copies.get(node); } }`,
      go: `func cloneGraph(node *Node) *Node { if node == nil { return nil }; copies := make(map[*Node]*Node); copies[node] = &Node{Val: node.Val}; q := []*Node{node}; for len(q) > 0 { curr := q[0]; q = q[1:]; for _, nbr := range curr.Neighbors { if _, ok := copies[nbr]; !ok { copies[nbr] = &Node{Val: nbr.Val}; q = append(q, nbr) }; copies[curr].Neighbors = append(copies[curr].Neighbors, copies[nbr]) } }; return copies[node] }`,
      c: `struct Node* cloneGraph(struct Node* node) { if(!node) return NULL; struct Node* copies[1000] = {NULL}; copies[node->val] = createGraphNode(node->val);\n    struct Node* q[1000];\n    q[0] = node;\n    int head = 0, tail = 1;\n    while(head < tail) {\n        struct Node* curr = q[head++];\n        for(int i=0; i<curr->neighborsCount; i++) {\n            struct Node* nbr = curr->neighbors[i];\n            if(!copies[nbr->val]) {\n                copies[nbr->val] = createGraphNode(nbr->val);\n                q[tail++] = nbr;\n            }\n            addNeighbor(copies[curr->val], copies[nbr->val]);\n        }\n    }\n    return copies[node->val]; }`
    }
  },
  numIslands: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'grid', type: 'MATRIX_INT' }],
      returnType: 'INT',
      functionName: 'numIslands'
    },
    inputs: ['[[1,1,0],[1,0,0],[0,0,1]]\n'],
    expected: ['2\n'],
    code: {
      cpp: `class Solution { void dfs(vector<vector<int>>& grid, int r, int c) {\n        if(r<0||r>=grid.size()||c<0||c>=grid[0].size()||grid[r][c]!=1) return;\n        grid[r][c] = 0;\n        dfs(grid,r+1,c); dfs(grid,r-1,c); dfs(grid,r,c+1); dfs(grid,r,c-1);\n    } public: int numIslands(vector<vector<int>>& grid) {\n        int count=0; for(int i=0;i<grid.size();i++) for(int j=0;j<grid[0].size();j++) if(grid[i][j]==1) { count++; dfs(grid,i,j); } return count; } };`,
      python: `class Solution:\n    def dfs(self, grid, r, c):\n        if r<0 or r>=len(grid) or c<0 or c>=len(grid[0]) or grid[r][c] != 1: return\n        grid[r][c] = 0\n        self.dfs(grid,r+1,c); self.dfs(grid,r-1,c); self.dfs(grid,r,c+1); self.dfs(grid,r,c-1)\n    def numIslands(self, grid: list[list[int]]) -> int:\n        count = 0\n        for i in range(len(grid)):\n            for j in range(len(grid[0])):\n                if grid[i][j] == 1: count += 1; self.dfs(grid, i, j)\n        return count`,
      javascript: `function numIslands(grid) { function dfs(r, c) {\n        if(r<0||r>=grid.length||c<0||c>=grid[0].length||grid[r][c]!==1) return;\n        grid[r][c] = 0; dfs(r+1,c); dfs(r-1,c); dfs(r,c+1); dfs(r,c-1);\n    } let count=0; for(let i=0;i<grid.length;i++) for(let j=0;j<grid[0].length;j++) if(grid[i][j]===1) { count++; dfs(i,j); } return count; }`,
      java: `class Solution { void dfs(int[][] grid, int r, int c) {\n        if(r<0||r>=grid.length||c<0||c>=grid[0].length||grid[r][c]!=1) return;\n        grid[r][c]=0; dfs(grid,r+1,c); dfs(grid,r-1,c); dfs(grid,r,c+1); dfs(grid,r,c-1);\n    } public int numIslands(int[][] grid) { int count=0; for(int i=0;i<grid.length;i++) for(int j=0;j<grid[0].length;j++) if(grid[i][j]==1) { count++; dfs(grid,i,j); } return count; } }`,
      go: `func dfs(grid [][]int, r, c int) { if r<0||r>=len(grid)||c<0||c>=len(grid[0])||grid[r][c]!=1 { return }; grid[r][c]=0; dfs(grid,r+1,c); dfs(grid,r-1,c); dfs(grid,r,c+1); dfs(grid,r,c-1) }; func numIslands(grid [][]int) int { count:=0; for i:=0; i<len(grid); i++ { for j:=0; j<len(grid[0]); j++ { if grid[i][j]==1 { count++; dfs(grid,i,j) } } }; return count }`,
      c: `void dfs(struct MatrixInt grid, int r, int c) { if(r<0||r>=grid.size||c<0||c>=grid.data[0].size||grid.data[r].data[c]!=1) return; grid.data[r].data[c]=0; dfs(grid,r+1,c); dfs(grid,r-1,c); dfs(grid,r,c+1); dfs(grid,r,c-1); } int numIslands(struct MatrixInt grid) { int count=0; for(int i=0;i<grid.size;i++) for(int j=0;j<grid.data[0].size;j++) if(grid.data[i].data[j]==1) { count++; dfs(grid,i,j); } return count; }`
    }
  },
  romanToInt: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 's', type: 'STRING' }],
      returnType: 'INT',
      functionName: 'romanToInt'
    },
    inputs: ['"III"\n', '"MCMXCIV"\n'],
    expected: ['3\n', '1994\n'],
    code: {
      cpp: `class Solution { int val(char c) { switch(c) { case 'I':return 1; case 'V':return 5; case 'X':return 10; case 'L':return 50; case 'C':return 100; case 'D':return 500; case 'M':return 1000; } return 0; } public: int romanToInt(string s) { int res=0; for(int i=0;i<s.length();i++) { if(i+1<s.length() && val(s[i]) < val(s[i+1])) res -= val(s[i]); else res += val(s[i]); } return res; } };`,
      python: `class Solution:\n    def romanToInt(self, s: str) -> int:\n        vals = {'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}\n        res = 0\n        for i in range(len(s)):\n            if i+1 < len(s) and vals[s[i]] < vals[s[i+1]]: res -= vals[s[i]]\n            else: res += vals[s[i]]\n        return res`,
      javascript: `function romanToInt(s) { const vals = {'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}; let res=0; for(let i=0;i<s.length;i++) { if(i+1<s.length && vals[s[i]] < vals[s[i+1]]) res -= vals[s[i]]; else res += vals[s[i]]; } return res; }`,
      java: `class Solution { int val(char c) { switch(c) { case 'I':return 1; case 'V':return 5; case 'X':return 10; case 'L':return 50; case 'C':return 100; case 'D':return 500; case 'M':return 1000; } return 0; } public int romanToInt(String s) { int res=0; for(int i=0;i<s.length();i++) { if(i+1<s.length() && val(s.charAt(i)) < val(s.charAt(i+1))) res -= val(s.charAt(i)); else res += val(s.charAt(i)); } return res; } }`,
      go: `func val(c byte) int { switch c { case 'I': return 1; case 'V': return 5; case 'X': return 10; case 'L': return 50; case 'C': return 100; case 'D': return 500; case 'M': return 1000 }; return 0 }; func romanToInt(s string) int { res:=0; for i:=0; i<len(s); i++ { if i+1<len(s) && val(s[i]) < val(s[i+1]) { res -= val(s[i]) } else { res += val(s[i]) } }; return res }`,
      c: `int val(char c) { switch(c) { case 'I':return 1; case 'V':return 5; case 'X':return 10; case 'L':return 50; case 'C':return 100; case 'D':return 500; case 'M':return 1000; } return 0; } int romanToInt(char* s) { int res=0; int len=strlen(s); for(int i=0;i<len;i++) { if(i+1<len && val(s[i]) < val(s[i+1])) res -= val(s[i]); else res += val(s[i]); } return res; }`
    }
  },
  intToRoman: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'num', type: 'INT' }],
      returnType: 'STRING',
      functionName: 'intToRoman'
    },
    inputs: ['1994\n'],
    expected: ['MCMXCIV\n'],
    code: {
      cpp: `class Solution { public: string intToRoman(int num) { string M[] = {"", "M", "MM", "MMM"}; string C[] = {"", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"}; string X[] = {"", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"}; string I[] = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"}; string res = ""; while(num >= 1000) { res += "M"; num -= 1000; } return res + C[(num%1000)/100] + X[(num%100)/10] + I[num%10]; } };`,
      python: `class Solution:\n    def intToRoman(self, num: int) -> str:\n        C = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"]\n        X = ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"]\n        I = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]\n        res = ""\n        while num >= 1000: res += "M"; num -= 1000\n        return res + C[(num%1000)//100] + X[(num%100)//10] + I[num%10]`,
      javascript: `function intToRoman(num) { const C = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"]; const X = ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"]; const I = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]; let res = ""; while(num >= 1000) { res += "M"; num -= 1000; } return res + C[Math.floor((num%1000)/100)] + X[Math.floor((num%100)/10)] + I[num%10]; }`,
      java: `class Solution { public String intToRoman(int num) { String[] C = {"", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"}; String[] X = {"", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"}; String[] I = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"}; StringBuilder res = new StringBuilder(); while(num >= 1000) { res.append("M"); num -= 1000; } res.append(C[(num%1000)/100]).append(X[(num%100)/10]).append(I[num%10]); return res.toString(); } }`,
      go: `func intToRoman(num int) string { C := []string{"", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"}; X := []string{"", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"}; I := []string{"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"}; res := ""; for num >= 1000 { res += "M"; num -= 1000 }; return res + C[(num%1000)/100] + X[(num%100)/10] + I[num%10] }`,
      c: `char* intToRoman(int num) { char* res = malloc(1000); res[0] = '\\0'; while(num >= 1000) { strcat(res, "M"); num -= 1000; } char* C[] = {"", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"}; char* X[] = {"", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"}; char* I[] = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"}; strcat(res, C[(num%1000)/100]); strcat(res, X[(num%100)/10]); strcat(res, I[num%10]); return res; }`
    }
  },
  isValidSudoku: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'board', type: 'MATRIX_INT' }],
      returnType: 'BOOLEAN',
      functionName: 'isValidSudoku'
    },
    inputs: ['[[5,3,0],[6,0,0],[0,9,8]]\n'],
    expected: ['true\n'],
    code: {
      cpp: `class Solution { public: bool isValidSudoku(vector<vector<int>>& board) { int rows[9]={0}, cols[9]={0}, boxes[9]={0}; for(int i=0; i<board.size(); i++) { for(int j=0; j<board[0].size(); j++) { int val = board[i][j]; if (val <= 0) continue; int val_bit = 1 << val; int box_idx = (i/3)*3 + (j/3); if((rows[i] & val_bit) || (cols[j] & val_bit) || (boxes[box_idx] & val_bit)) return false; rows[i] |= val_bit; cols[j] |= val_bit; boxes[box_idx] |= val_bit; } } return true; } };`,
      python: `class Solution:\n    def isValidSudoku(self, board: list[list[int]]) -> bool:\n        rows, cols, boxes = [0]*9, [0]*9, [0]*9\n        for i in range(len(board)):\n            for j in range(len(board[0])):\n                val = board[i][j]\n                if val <= 0: continue\n                bit = 1 << val; box_idx = (i//3)*3 + (j//3)\n                if (rows[i] & bit) or (cols[j] & bit) or (boxes[box_idx] & bit): return False\n                rows[i] |= bit; cols[j] |= bit; boxes[box_idx] |= bit\n        return True`,
      javascript: `function isValidSudoku(board) { const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);\n    for(let i=0; i<board.length; i++) {\n        for(let j=0; j<board[0].length; j++) {\n            let val = board[i][j]; if (val <= 0) continue;\n            let bit = 1 << val; let box_idx = Math.floor(i/3)*3 + Math.floor(j/3);\n            if((rows[i] & bit) || (cols[j] & bit) || (boxes[box_idx] & bit)) return false;\n            rows[i] |= bit; cols[j] |= bit; boxes[box_idx] |= bit;\n        }\n    } return true; }`,
      java: `class Solution { public boolean isValidSudoku(int[][] board) { int[] rows=new int[9], cols=new int[9], boxes=new int[9];\n    for(int i=0; i<board.length; i++) {\n        for(int j=0; j<board[0].length; j++) {\n            int val = board[i][j]; if (val <= 0) continue;\n            int bit = 1 << val; int box_idx = (i/3)*3 + (j/3);\n            if((rows[i] & bit) != 0 || (cols[j] & bit) != 0 || (boxes[box_idx] & bit) != 0) return false;\n            rows[i] |= bit; cols[j] |= bit; boxes[box_idx] |= bit;\n        }\n    } return true; } }`,
      go: `func isValidSudoku(board [][]int) bool { rows, cols, boxes := make([]int, 9), make([]int, 9), make([]int, 9);\n    for i:=0; i<len(board); i++ {\n        for j:=0; j<len(board[0]); j++ {\n            val := board[i][j]; if val <= 0 { continue };\n            bit := 1 << val; box_idx := (i/3)*3 + (j/3);\n            if (rows[i] & bit) != 0 || (cols[j] & bit) != 0 || (boxes[box_idx] & bit) != 0 { return false };\n            rows[i] |= bit; cols[j] |= bit; boxes[box_idx] |= bit;\n        }\n    }; return true }`,
      c: `bool isValidSudoku(struct MatrixInt board) { int rows[9]={0}, cols[9]={0}, boxes[9]={0};\n    for(int i=0; i<board.size; i++) {\n        for(int j=0; j<board.data[0].size; j++) {\n            int val = board.data[i].data[j]; if (val <= 0) continue;\n            int bit = 1 << val; int box_idx = (i/3)*3 + (j/3);\n            if((rows[i] & bit) || (cols[j] & bit) || (boxes[box_idx] & bit)) return false;\n            rows[i] |= bit; cols[j] |= bit; boxes[box_idx] |= bit;\n        }\n    } return true; }`
    }
  },
  lruCache: {
    meta: {
      category: 'CLASS_DESIGN',
      functionName: 'LRUCache',
      methods: [
        { name: 'Constructor', parameters: [{ name: 'capacity', type: 'INT' }] },
        { name: 'get', parameters: [{ name: 'key', type: 'INT' }], returnType: 'INT' },
        { name: 'put', parameters: [{ name: 'key', type: 'INT' }, { name: 'value', type: 'INT' }], returnType: 'void' }
      ]
    },
    inputs: ['["LRUCache","put","put","get","put","get","put","get","get","get"]\n[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]\n'],
    expected: ['[null,null,null,1,null,-1,null,-1,3,4]\n'],
    code: {
      cpp: `
#include <unordered_map>
#include <list>
using namespace std;
class LRUCache {
    int cap;
    list<pair<int, int>> l;
    unordered_map<int, list<pair<int, int>>::iterator> m;
public:
    LRUCache(int capacity) { cap = capacity; }
    int get(int key) {
        if (!m.count(key)) return -1;
        l.splice(l.begin(), l, m[key]);
        return m[key]->second;
    }
    void put(int key, int value) {
        if (m.count(key)) {
            l.splice(l.begin(), l, m[key]);
            m[key]->second = value;
            return;
        }
        if (l.size() == cap) {
            auto d_key = l.back().first;
            l.pop_back();
            m.erase(d_key);
        }
        l.push_front({key, value});
        m[key] = l.begin();
    }
};`,
      python: `
class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}
        self.order = []
    def get(self, key: int) -> int:
        if key not in self.cache: return -1
        self.order.remove(key)
        self.order.append(key)
        return self.cache[key]
    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            self.order.remove(key)
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        self.cache[key] = value
        self.order.append(key)`,
      javascript: `
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }
    get(key) {
        if (!this.cache.has(key)) return -1;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    put(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}`,
      java: `
class LRUCache {
    private int capacity;
    private LinkedHashMap<Integer, Integer> map;
    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.map = new LinkedHashMap<Integer, Integer>(capacity, 0.75f, true) {
            protected boolean removeEldestEntry(Map.Entry eldest) {
                return size() > LRUCache.this.capacity;
            }
        };
    }
    public int get(int key) { return map.getOrDefault(key, -1); }
    public void put(int key, int value) { map.put(key, value); }
}`,
      go: `
type LRUCache struct {
    capacity int
    cache    map[int]*list.Element
    list     *list.List
}
type entry struct {
    key   int
    value int
}
func Constructor(capacity int) *LRUCache {
    return &LRUCache{
        capacity: capacity,
        cache:    make(map[int]*list.Element),
        list:     list.New(),
    }
}
func (c *LRUCache) Get(key int) int {
    if elem, ok := c.cache[key]; ok {
        c.list.MoveToFront(elem)
        return elem.Value.(*entry).value
    }
    return -1
}
func (c *LRUCache) Put(key int, value int) {
    if elem, ok := c.cache[key]; ok {
        c.list.MoveToFront(elem)
        elem.Value.(*entry).value = value
        return
    }
    if c.list.Len() >= c.capacity {
        back := c.list.Back()
        if back != nil {
            c.list.Remove(back)
            delete(c.cache, back.Value.(*entry).key)
        }
    }
    elem := c.list.PushFront(&entry{key, value})
    c.cache[key] = elem
}`,
      c: `
#include <stdio.h>
#include <stdlib.h>
typedef struct {
    int key;
    int value;
    int age;
} LRUNode;
typedef struct {
    int capacity;
    int count;
    int time;
    LRUNode* nodes;
} LRUCache;
void* lRUCacheCreate(int capacity) {
    LRUCache* obj = malloc(sizeof(LRUCache));
    obj->capacity = capacity;
    obj->count = 0;
    obj->time = 0;
    obj->nodes = malloc(sizeof(LRUNode) * capacity);
    return obj;
}
int lRUCacheGet(void* cache, int key) {
    LRUCache* obj = (LRUCache*)cache;
    obj->time++;
    for(int i=0; i<obj->count; i++) {
        if (obj->nodes[i].key == key) {
            obj->nodes[i].age = obj->time;
            return obj->nodes[i].value;
        }
    }
    return -1;
}
void lRUCachePut(void* cache, int key, int value) {
    LRUCache* obj = (LRUCache*)cache;
    obj->time++;
    for(int i=0; i<obj->count; i++) {
        if (obj->nodes[i].key == key) {
            obj->nodes[i].age = obj->time;
            obj->nodes[i].value = value;
            return;
        }
    }
    if (obj->count < obj->capacity) {
        obj->nodes[obj->count].key = key;
        obj->nodes[obj->count].value = value;
        obj->nodes[obj->count].age = obj->time;
        obj->count++;
    } else {
        int oldest_idx = 0;
        int oldest_age = obj->nodes[0].age;
        for(int i=1; i<obj->count; i++) {
            if (obj->nodes[i].age < oldest_age) {
                oldest_age = obj->nodes[i].age;
                oldest_idx = i;
            }
        }
        obj->nodes[oldest_idx].key = key;
        obj->nodes[oldest_idx].value = value;
        obj->nodes[oldest_idx].age = obj->time;
    }
}
void lRUCacheFree(void* cache) {
    LRUCache* obj = (LRUCache*)cache;
    free(obj->nodes);
    free(obj);
}
`
    }
  }
};

async function runCompatibilitySuite() {
  console.log('====================================================');
  console.log('  RUNNING AUTOMATED E2E COMPATIBILITY MATRIX SUITE  ');
  console.log('====================================================');

  const targetLanguages = ['cpp', 'python', 'javascript', 'java', 'go', 'c'];
  let passedTests = 0;
  let totalTests = 0;

  for (const lang of targetLanguages) {
    console.log(`\nTesting language: [${lang.toUpperCase()}]`);

    for (const [probName, probSpec] of Object.entries(solutions)) {
      const userCode = probSpec.code[lang];
      if (!userCode) continue;

      totalTests++;
      console.log(` - Problem: ${probName}`);

      // 1. Code Assembly
      let assembledCode;
      try {
        assembledCode = assemblyEngine.assembleCode(lang, userCode, probSpec.meta);
      } catch (e) {
        console.error(`   ❌ Assembly failed:`, e.stack);
        process.exit(1);
      }

      // 2. Compilation
      let compileRes;
      try {
        compileRes = await executionEngine.compile(assembledCode, lang);
      } catch (e) {
        console.error(`   ❌ Compilation error:`, e.stack);
        process.exit(1);
      }

      if (!compileRes.success) {
        console.error(`   ❌ Compilation failed:`, compileRes.stderr);
        console.error(`      Source code:`, assembledCode);
        process.exit(1);
      }

      // 3. Execution on multiple test inputs
      for (let idx = 0; idx < probSpec.inputs.length; idx++) {
        const input = probSpec.inputs[idx];
        const expectedOutput = probSpec.expected[idx];

        let runRes;
        try {
          runRes = await executionEngine.execute(compileRes.artifact, lang, input);
        } catch (e) {
          console.error(`   ❌ Runner Execution failed:`, e.stack);
          process.exit(1);
        }

        if (runRes.limitError) {
          console.error(`   ❌ Exec Limit Error:`, runRes.limitError.message);
          process.exit(1);
        }

        if (runRes.exitInfo.code !== 0 && runRes.exitInfo.code !== null) {
          console.error(`   ❌ Exit issue: Code=${runRes.exitInfo.code}, Signal=${runRes.exitInfo.signal}`);
          console.error(`      Stdout:`, runRes.stdout);
          console.error(`      Stderr:`, runRes.stderr);
          process.exit(1);
        }

        // Standardize newline formatting of stdout
        const stdoutClean = runRes.stdout.replace(/\r\n/g, '\n').trim();
        const expectedClean = expectedOutput.replace(/\r\n/g, '\n').trim();
        try {
          assert.strictEqual(stdoutClean, expectedClean);
          console.log(`   ✅ Testcase ${idx + 1} passed`);
        } catch (err) {
          console.error(`   ❌ Testcase ${idx + 1} mismatch!`);
          console.error(`      Expected: "${expectedClean}"`);
          console.error(`      Got:      "${stdoutClean}"`);
          console.error(`      Stderr:   "${runRes.stderr}"`);
          process.exit(1);
        }
      }

      // 4. Cleanup
      try {
        await executionEngine.cleanup(compileRes.artifact);
      } catch (e) {
        console.warn(`   ⚠️ Cleanup error:`, e.message);
      }

      passedTests++;
    }
  }

  console.log('\n====================================================');
  console.log(`✅ COMPATIBILITY MATRIX PASSED: ${passedTests}/${totalTests} tests`);
  console.log('====================================================');
}

runCompatibilitySuite().catch(e => {
  console.error('Fatal Matrix Failure:', e);
  process.exit(1);
});

if (typeof module !== 'undefined') {
  module.exports = { solutions };
}
