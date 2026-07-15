package main

import (
	"strconv"
	"strings"
)

type Node struct {
	Val       int
	Neighbors []*Node
}

func parseAdjacencyList(str string) [][]int {
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
