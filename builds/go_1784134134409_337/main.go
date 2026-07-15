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


// --- HELPERS ---


// --- USER CODE ---

func isSameTree(p *TreeNode, q *TreeNode) bool {
    if p == nil && q == nil {
        return true
    }
    if p == nil || q == nil {
        return false
    }
    return p.Val == q.Val && isSameTree(p.Left, q.Left) && isSameTree(p.Right, q.Right)
}

// --- MAIN ---
func main() {
    scanner := bufio.NewScanner(os.Stdin)
    buf := make([]byte, 1024*1024)
    scanner.Buffer(buf, 1024*1024)
    _ = strconv.Itoa(0)
    _ = strings.TrimSpace("")
    var line0 string;
    if scanner.Scan() {
        line0 = scanner.Text();
    }
    p := deserializeTree(line0)
    var line1 string;
    if scanner.Scan() {
        line1 = scanner.Text();
    }
    q := deserializeTree(line1)
    result := isSameTree(p, q)
    fmt.Println(strconv.FormatBool(result))
    
}
