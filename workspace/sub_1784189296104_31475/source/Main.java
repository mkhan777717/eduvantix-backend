// --- IMPORTS ---
import java.io.*;
import java.util.*;

// --- RUNTIME ---
import java.util.*;

class Node {
    public int val;
    public List<Node> neighbors;
    public Node() {
        val = 0;
        neighbors = new ArrayList<Node>();
    }
    public Node(int _val) {
        val = _val;
        neighbors = new ArrayList<Node>();
    }
    public Node(int _val, List<Node> _neighbors) {
        val = _val;
        neighbors = _neighbors;
    }
}

class GraphHelper {
    public static List<List<Integer>> parseAdjacencyList(String str) {
        List<List<Integer>> res = new ArrayList<>();
        int i = 0;
        while (i < str.length()) {
            if (str.charAt(i) == '[') {
                if (i > 0 && str.charAt(i - 1) == '[') { i++; continue; }
                int end = str.indexOf(']', i);
                if (end != -1) {
                    String sub = str.substring(i + 1, end);
                    String[] tokens = sub.split(",");
                    List<Integer> neighborsList = new ArrayList<>();
                    for (String t : tokens) {
                        if (!t.trim().isEmpty()) {
                            neighborsList.add(Integer.parseInt(t.trim()));
                        }
                    }
                    res.add(neighborsList);
                    i = end + 1;
                } else {
                    break;
                }
            } else {
                i++;
            }
        }
        return res;
    }

    public static Node deserialize(String str) {
        if (str == null || str.equals("[]") || str.equals("null") || str.isEmpty()) return null;
        List<List<Integer>> adj = parseAdjacencyList(str);
        if (adj.isEmpty()) return null;
        
        Map<Integer, Node> map = new HashMap<>();
        for (int u = 1; u <= adj.size(); u++) {
            map.put(u, new Node(u));
        }
        for (int u = 1; u <= adj.size(); u++) {
            Node node = map.get(u);
            for (int neighborVal : adj.get(u - 1)) {
                node.neighbors.add(map.get(neighborVal));
            }
        }
        return map.get(1);
    }

    private static void serializeDFS(Node node, Map<Integer, List<Integer>> adj, Set<Integer> visited) {
        if (node == null || visited.contains(node.val)) return;
        visited.add(node.val);
        List<Integer> neighbors = new ArrayList<>();
        for (Node neighbor : node.neighbors) {
            neighbors.add(neighbor.val);
        }
        adj.put(node.val, neighbors);
        for (Node neighbor : node.neighbors) {
            serializeDFS(neighbor, adj, visited);
        }
    }

    public static String serialize(Node node) {
        if (node == null) return "[]";
        Map<Integer, List<Integer>> adj = new HashMap<>();
        Set<Integer> visited = new HashSet<>();
        serializeDFS(node, adj, visited);
        if (adj.isEmpty()) return "[]";
        
        int maxVal = 0;
        for (int key : adj.keySet()) {
            maxVal = Math.max(maxVal, key);
        }
        
        StringBuilder sb = new StringBuilder("[");
        for (int i = 1; i <= maxVal; i++) {
            sb.append("[");
            if (adj.containsKey(i)) {
                List<Integer> neighbors = adj.get(i);
                for (int j = 0; j < neighbors.size(); j++) {
                    sb.append(neighbors.get(j));
                    if (j + 1 < neighbors.size()) sb.append(",");
                }
            }
            sb.append("]");
            if (i < maxVal) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }
}


// --- HELPERS ---


// --- USER CODE ---
class Solution { public Node cloneGraph(Node node) { if(node==null) return null; Map<Node, Node> copies = new HashMap<>(); copies.put(node, new Node(node.val));
    List<Node> q = new ArrayList<>();
    q.add(node);
    int head = 0;
    while(head < q.size()) {
        Node curr = q.get(head++);
        for(Node nbr : curr.neighbors) {
            if(!copies.containsKey(nbr)) {
                copies.put(nbr, new Node(nbr.val));
                q.add(nbr);
            }
            copies.get(curr).neighbors.add(copies.get(nbr));
        }
    }
    return copies.get(node); } }

// --- MAIN ---
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        try {
            String line0 = reader.readLine();
                    Node node = GraphHelper.deserialize(line0);
            Solution solver = new Solution();
                    Node result = solver.cloneGraph(node);
            System.out.println(GraphHelper.serialize(result));
        } catch (Exception e) {
            System.err.println(e.getMessage());
            System.exit(1);
        }
    }
}
