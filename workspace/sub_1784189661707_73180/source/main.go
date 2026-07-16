package main

// --- IMPORTS ---
import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// --- RUNTIME ---




type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func deserializeTree(str string) *TreeNode {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	str = strings.ReplaceAll(str, " ", "")
	if len(str) == 0 {
		return nil
	}
	tokens := strings.Split(str, ",")
	if len(tokens) == 0 || tokens[0] == "null" || tokens[0] == "" {
		return nil
	}

	val, _ := strconv.Atoi(tokens[0])
	root := &TreeNode{Val: val}
	queue := []*TreeNode{root}

	i := 1
	for len(queue) > 0 && i < len(tokens) {
		curr := queue[0]
		queue = queue[1:]

		if i < len(tokens) {
			if tokens[i] != "null" && tokens[i] != "" {
				val, _ := strconv.Atoi(tokens[i])
				curr.Left = &TreeNode{Val: val}
				queue = append(queue, curr.Left)
			}
			i++
		}
		if i < len(tokens) {
			if tokens[i] != "null" && tokens[i] != "" {
				val, _ := strconv.Atoi(tokens[i])
				curr.Right = &TreeNode{Val: val}
				queue = append(queue, curr.Right)
			}
			i++
		}
	}
	return root
}

func serializeTree(root *TreeNode) string {
	if root == nil {
		return "[]"
	}
	var nodes []string
	queue := []*TreeNode{root}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		if curr != nil {
			nodes = append(nodes, strconv.Itoa(curr.Val))
			queue = append(queue, curr.Left)
			queue = append(queue, curr.Right)
		} else {
			nodes = append(nodes, "null")
		}
	}

	for len(nodes) > 0 && nodes[len(nodes)-1] == "null" {
		nodes = nodes[:len(nodes)-1]
	}

	return "[" + strings.Join(nodes, ",") + "]"
}






type ListNode struct {
	Val  int
	Next *ListNode
}

func deserializeList(str string) *ListNode {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	str = strings.ReplaceAll(str, " ", "")
	if len(str) == 0 {
		return nil
	}
	tokens := strings.Split(str, ",")
	var head, tail *ListNode
	for _, t := range tokens {
		if t != "" {
			val, _ := strconv.Atoi(t)
			node := &ListNode{Val: val}
			if head == nil {
				head = node
				tail = node
			} else {
				tail.Next = node
				tail = node
			}
		}
	}
	return head
}

func serializeList(head *ListNode) string {
	if head == nil {
		return "[]"
	}
	var res []string
	for head != nil {
		res = append(res, strconv.Itoa(head.Val))
		head = head.Next
	}
	return "[" + strings.Join(res, ",") + "]"
}

// Collection Helpers
func parseVectorInt(str string) []int {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	str = strings.ReplaceAll(str, ",", " ")
	tokens := strings.Fields(str)
	res := make([]int, 0, len(tokens))
	for _, t := range tokens {
		val, _ := strconv.Atoi(t)
		res = append(res, val)
	}
	return res
}

func serializeVectorInt(vec []int) string {
	var res []string
	for _, val := range vec {
		res = append(res, strconv.Itoa(val))
	}
	return "[" + strings.Join(res, ",") + "]"
}

func parseVectorFloat(str string) []float64 {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	str = strings.ReplaceAll(str, ",", " ")
	tokens := strings.Fields(str)
	res := make([]float64, 0, len(tokens))
	for _, t := range tokens {
		val, _ := strconv.ParseFloat(t, 64)
		res = append(res, val)
	}
	return res
}

func serializeVectorFloat(vec []float64) string {
	var res []string
	for _, val := range vec {
		res = append(res, strconv.FormatFloat(val, 'f', -1, 64))
	}
	return "[" + strings.Join(res, ",") + "]"
}

func parseVectorString(str string) []string {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	if len(str) == 0 {
		return []string{}
	}
	tokens := strings.Split(str, ",")
	res := make([]string, 0, len(tokens))
	for _, t := range tokens {
		cleaned := strings.Trim(strings.TrimSpace(t), "\"")
		res = append(res, cleaned)
	}
	return res
}

func serializeVectorString(vec []string) string {
	var res []string
	for _, val := range vec {
		res = append(res, "\""+val+"\"")
	}
	return "[" + strings.Join(res, ",") + "]"
}

func parseVectorBool(str string) []bool {
	str = strings.ReplaceAll(str, "[", "")
	str = strings.ReplaceAll(str, "]", "")
	str = strings.ReplaceAll(str, " ", "")
	if len(str) == 0 {
		return []bool{}
	}
	tokens := strings.Split(str, ",")
	res := make([]bool, 0, len(tokens))
	for _, t := range tokens {
		if t != "" {
			val, _ := strconv.ParseBool(t)
			res = append(res, val)
		}
	}
	return res
}

func serializeVectorBool(vec []bool) string {
	var res []string
	for _, val := range vec {
		res = append(res, strconv.FormatBool(val))
	}
	return "[" + strings.Join(res, ",") + "]"
}

func parseMatrixInt(str string) [][]int {
	if len(str) == 0 || str == "[]" || str == "[[]]" {
		return [][]int{}
	}
	var res [][]int
	i := 0
	for i < len(str) {
		if str[i] == '[' {
			if i > 0 && str[i-1] == '[' {
				i++
				continue
			}
			end := strings.Index(str[i:], "]")
			if end != -1 {
				sub := str[i+1 : i+end]
				res = append(res, parseVectorInt(sub))
				i = i + end + 1
			} else {
				break
			}
		} else {
			i++
		}
	}
	return res
}

func serializeMatrixInt(mat [][]int) string {
	var res []string
	for _, vec := range mat {
		res = append(res, serializeVectorInt(vec))
	}
	return "[" + strings.Join(res, ",") + "]"
}

func parseMatrixString(str string) [][]string {
	if len(str) == 0 || str == "[]" || str == "[[]]" {
		return [][]string{}
	}
	var res [][]string
	i := 0
	for i < len(str) {
		if str[i] == '[' {
			if i > 0 && str[i-1] == '[' {
				i++
				continue
			}
			end := strings.Index(str[i:], "]")
			if end != -1 {
				sub := str[i+1 : i+end]
				res = append(res, parseVectorString(sub))
				i = i + end + 1
			} else {
				break
			}
		} else {
			i++
		}
	}
	return res
}

func serializeMatrixString(mat [][]string) string {
	var res []string
	for _, vec := range mat {
		res = append(res, serializeVectorString(vec))
	}
	return "[" + strings.Join(res, ",") + "]"
}






type Node struct {
	Val       int
	Neighbors []*Node
}

func parseAdjacencyList(str string) [][]int {
	var res [][]int
	str = strings.TrimSpace(str)
	if len(str) < 2 || str[0] != '[' || str[len(str)-1] != ']' {
		return res
	}
	str = str[1 : len(str)-1]

	i := 0
	for i < len(str) {
		if str[i] == '[' {
			end := strings.Index(str[i:], "]")
			if end != -1 {
				sub := str[i+1 : i+end]
				tokens := strings.Split(sub, ",")
				var neighborVals []int
				for _, t := range tokens {
					cleaned := strings.TrimSpace(t)
					if cleaned != "" {
						val, _ := strconv.Atoi(cleaned)
						neighborVals = append(neighborVals, val)
					}
				}
				res = append(res, neighborVals)
				i = i + end + 1
			} else {
				break
			}
		} else {
			i++
		}
	}
	return res
}

func deserializeGraph(str string) *Node {
	if len(str) == 0 || str == "[]" || str == "null" {
		return nil
	}
	adj := parseAdjacencyList(str)
	if len(adj) == 0 {
		return nil
	}

	nodeMap := make(map[int]*Node)
	for u := 1; u <= len(adj); u++ {
		nodeMap[u] = &Node{Val: u}
	}

	for u := 1; u <= len(adj); u++ {
		for _, neighborVal := range adj[u-1] {
			nodeMap[u].Neighbors = append(nodeMap[u].Neighbors, nodeMap[neighborVal])
		}
	}
	return nodeMap[1]
}

func serializeGraphDFS(node *Node, adj map[int][]int, visited map[int]bool) {
	if node == nil || visited[node.Val] {
		return
	}
	visited[node.Val] = true
	var neighbors []int
	for _, neighbor := range node.Neighbors {
		neighbors = append(neighbors, neighbor.Val)
	}
	adj[node.Val] = neighbors
	for _, neighbor := range node.Neighbors {
		serializeGraphDFS(neighbor, adj, visited)
	}
}

func serializeGraph(node *Node) string {
	if node == nil {
		return "[]"
	}
	adj := make(map[int][]int)
	visited := make(map[int]bool)
	serializeGraphDFS(node, adj, visited)

	if len(adj) == 0 {
		return "[]"
	}

	maxVal := 0
	for key := range adj {
		if key > maxVal {
			maxVal = key
		}
	}

	var res []string
	for i := 1; i <= maxVal; i++ {
		var neighborsStr []string
		if neighbors, ok := adj[i]; ok {
			for _, n := range neighbors {
				neighborsStr = append(neighborsStr, strconv.Itoa(n))
			}
		}
		res = append(res, "["+strings.Join(neighborsStr, ",")+"]")
	}
	return "[" + strings.Join(res, ",") + "]"
}


// --- HELPERS ---

func parseMatrixString(str string) [][]string {
    var res [][]string
    str = strings.TrimSpace(str)
    if len(str) < 2 { return res }
    str = str[1 : len(str)-1]
    
    i := 0
    for i < len(str) {
        for i < len(str) && str[i] != '[' { i++ }
        if i >= len(str) { break }
        start := i + 1
        for i < len(str) && str[i] != ']' { i++ }
        end := i
        sub := strings.TrimSpace(str[start:end])
        var argList []string
        if len(sub) > 0 {
            tokens := strings.Split(sub, ",")
            for _, tok := range tokens {
                tok = strings.TrimSpace(tok)
                tok = strings.Trim(tok, """)
                argList = append(argList, tok)
            }
        }
        res = append(res, argList)
        i = end + 1
    }
    return res
}
func mustInt(s string) int {
    v, _ := strconv.Atoi(s)
    return v
}
func mustFloat(s string) float64 {
    v, _ := strconv.ParseFloat(s, 64)
    return v
}


// --- USER CODE ---

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
}

// --- MAIN ---
func main() {
    scanner := bufio.NewScanner(os.Stdin)
    buf := make([]byte, 1024*1024)
    scanner.Buffer(buf, 1024*1024)
    _ = strconv.Itoa(0)
    _ = strings.TrimSpace("")
    var line0, line1 string;
    if scanner.Scan() { line0 = scanner.Text() }
    if scanner.Scan() { line1 = scanner.Text() }
    operations := parseVectorString(line0)
    args := parseMatrixString(line1)
    var obj *LRUCache
    var results []string
    for i, op := range operations {
        arg := args[i]
        if i == 0 {
            obj = Constructor(mustInt(arg[0]))
            results = append(results, "null")
        } else {
            switch op {
            case "get":
                res := obj.Get(mustInt(arg[0]))
                results = append(results, strconv.Itoa(res))
            case "put":
                obj.Put(mustInt(arg[0]), mustInt(arg[1]))
                results = append(results, "null")
            default:
                results = append(results, "null")
            }
        }
    }
    fmt.Print("[")
    for idx, val := range results {
        if idx > 0 { fmt.Print(",") }
        if val == "null" || val == "true" || val == "false" {
            fmt.Print(val)
        } else {
            if _, err := strconv.Atoi(val); err == nil {
                fmt.Print(val)
            } else {
                fmt.Printf(""%s"", val)
            }
        }
    }
    fmt.Println("]")
}
