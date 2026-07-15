package main

import (
	"strconv"
	"strings"
)

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
