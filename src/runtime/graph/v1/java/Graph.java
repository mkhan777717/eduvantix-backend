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
        str = str.trim();
        if (str.length() < 2 || str.charAt(0) != '[' || str.charAt(str.length() - 1) != ']') return res;
        str = str.substring(1, str.length() - 1);

        int i = 0;
        while (i < str.length()) {
            if (str.charAt(i) == '[') {
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
