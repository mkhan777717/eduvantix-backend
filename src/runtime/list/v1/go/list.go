package main

import (
	"strconv"
	"strings"
)

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
