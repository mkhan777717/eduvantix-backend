// --- IMPORTS ---
import java.io.*;
import java.util.*;

// --- RUNTIME ---


class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;
    public TreeNode() {}
    public TreeNode(int val) { this.val = val; }
    public TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

class TreeHelper {
    public static TreeNode deserialize(String str) {
        if (str == null) return null;
        str = str.replace("[", "").replace("]", "").replace(" ", "");
        if (str.isEmpty()) return null;
        String[] tokens = str.split(",");
        if (tokens.length == 0 || tokens[0].equals("null") || tokens[0].isEmpty()) return null;
        
        TreeNode root = new TreeNode(Integer.parseInt(tokens[0]));
        Queue<TreeNode> q = new LinkedList<>();
        q.add(root);
        
        int i = 1;
        while (!q.isEmpty() && i < tokens.length) {
            TreeNode curr = q.poll();
            if (i < tokens.length) {
                if (!tokens[i].equals("null") && !tokens[i].isEmpty()) {
                    curr.left = new TreeNode(Integer.parseInt(tokens[i]));
                    q.add(curr.left);
                }
                i++;
            }
            if (i < tokens.length) {
                if (!tokens[i].equals("null") && !tokens[i].isEmpty()) {
                    curr.right = new TreeNode(Integer.parseInt(tokens[i]));
                    q.add(curr.right);
                }
                i++;
            }
        }
        return root;
    }
    
    public static String serialize(TreeNode root) {
        if (root == null) return "[]";
        List<String> nodes = new ArrayList<>();
        Queue<TreeNode> q = new LinkedList<>();
        q.add(root);
        
        while (!q.isEmpty()) {
            TreeNode curr = q.poll();
            if (curr != null) {
                nodes.add(String.valueOf(curr.val));
                q.add(curr.left);
                q.add(curr.right);
            } else {
                nodes.add("null");
            }
        }
        
        while (!nodes.isEmpty() && nodes.get(nodes.size() - 1).equals("null")) {
            nodes.remove(nodes.size() - 1);
        }
        
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < nodes.size(); i++) {
            sb.append(nodes.get(i));
            if (i + 1 < nodes.size()) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }
}




class ListNode {
    public int val;
    public ListNode next;
    public ListNode() {}
    public ListNode(int val) { this.val = val; }
    public ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class ListHelper {
    public static ListNode deserialize(String str) {
        if (str == null) return null;
        str = str.replace("[", "").replace("]", "").replace(" ", "");
        if (str.isEmpty()) return null;
        String[] tokens = str.split(",");
        ListNode head = null;
        ListNode tail = null;
        for (String t : tokens) {
            if (!t.isEmpty()) {
                ListNode node = new ListNode(Integer.parseInt(t));
                if (head == null) {
                    head = node;
                    tail = node;
                } else {
                    tail.next = node;
                    tail = node;
                }
            }
        }
        return head;
    }

    public static String serialize(ListNode head) {
        if (head == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        while (head != null) {
            sb.append(head.val);
            if (head.next != null) sb.append(",");
            head = head.next;
        }
        sb.append("]");
        return sb.toString();
    }

    public static int[] parseVectorInt(String str) {
        if (str == null) return new int[0];
        str = str.replace("[", "").replace("]", "").replace(",", " ").trim();
        if (str.isEmpty()) return new int[0];
        String[] tokens = str.split("\\s+");
        int[] res = new int[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            res[i] = Integer.parseInt(tokens[i]);
        }
        return res;
    }

    public static String serializeVectorInt(int[] vec) {
        if (vec == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vec.length; i++) {
            sb.append(vec[i]);
            if (i + 1 < vec.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    public static double[] parseVectorFloat(String str) {
        if (str == null) return new double[0];
        str = str.replace("[", "").replace("]", "").replace(",", " ").trim();
        if (str.isEmpty()) return new double[0];
        String[] tokens = str.split("\\s+");
        double[] res = new double[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            res[i] = Double.parseDouble(tokens[i]);
        }
        return res;
    }

    public static String serializeVectorFloat(double[] vec) {
        if (vec == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vec.length; i++) {
            sb.append(vec[i]);
            if (i + 1 < vec.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    public static String[] parseVectorString(String str) {
        if (str == null) return new String[0];
        str = str.replace("[", "").replace("]", "");
        if (str.isEmpty()) return new String[0];
        String[] tokens = str.split(",");
        String[] res = new String[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            res[i] = tokens[i].trim().replace("\"", "");
        }
        return res;
    }

    public static String serializeVectorString(String[] vec) {
        if (vec == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vec.length; i++) {
            sb.append("\"").append(vec[i]).append("\"");
            if (i + 1 < vec.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    public static boolean[] parseVectorBool(String str) {
        if (str == null) return new boolean[0];
        str = str.replace("[", "").replace("]", "").replace(",", " ").trim();
        if (str.isEmpty()) return new boolean[0];
        String[] tokens = str.split("\\s+");
        boolean[] res = new boolean[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            res[i] = Boolean.parseBoolean(tokens[i]);
        }
        return res;
    }

    public static String serializeVectorBool(boolean[] vec) {
        if (vec == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vec.length; i++) {
            sb.append(vec[i]);
            if (i + 1 < vec.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    public static int[][] parseMatrixInt(String str) {
        if (str == null || str.equals("[]") || str.equals("[[]]")) return new int[0][0];
        str = str.trim();
        List<int[]> rows = new ArrayList<>();
        int i = 0;
        while (i < str.length()) {
            if (str.charAt(i) == '[') {
                if (i > 0 && str.charAt(i-1) == '[') { i++; continue; }
                int end = str.indexOf(']', i);
                if (end != -1) {
                    String sub = str.substring(i + 1, end);
                    rows.add(parseVectorInt(sub));
                    i = end + 1;
                } else {
                    break;
                }
            } else {
                i++;
            }
        }
        return rows.toArray(new int[0][]);
    }

    public static String serializeMatrixInt(int[][] mat) {
        if (mat == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < mat.length; i++) {
            sb.append(serializeVectorInt(mat[i]));
            if (i + 1 < mat.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    public static String[][] parseMatrixString(String str) {
        if (str == null || str.equals("[]") || str.equals("[[]]")) return new String[0][0];
        str = str.trim();
        List<String[]> rows = new ArrayList<>();
        int i = 0;
        while (i < str.length()) {
            if (str.charAt(i) == '[') {
                if (i > 0 && str.charAt(i-1) == '[') { i++; continue; }
                int end = str.indexOf(']', i);
                if (end != -1) {
                    String sub = str.substring(i + 1, end);
                    rows.add(parseVectorString(sub));
                    i = end + 1;
                } else {
                    break;
                }
            } else {
                i++;
            }
        }
        return rows.toArray(new String[0][]);
    }

    public static String serializeMatrixString(String[][] mat) {
        if (mat == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < mat.length; i++) {
            sb.append(serializeVectorString(mat[i]));
            if (i + 1 < mat.length) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }
}




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


// --- HELPERS ---

    public static String[] parseOpsJava(String str) {
        if (str == null) return new String[0];
        str = str.replace("[", "").replace("]", "").replace("\"", "");
        if (str.isEmpty()) return new String[0];
        String[] tokens = str.split(",");
        for (int i = 0; i < tokens.length; i++) {
            tokens[i] = tokens[i].trim();
        }
        return tokens;
    }
    public static List<List<String>> parseArgsJava(String str) {
        List<List<String>> res = new ArrayList<>();
        if (str == null) return res;
        str = str.trim();
        if (str.startsWith("[")) str = str.substring(1);
        if (str.endsWith("]")) str = str.substring(0, str.length() - 1);
        int i = 0;
        while (i < str.length()) {
            while (i < str.length() && str.charAt(i) != '[') i++;
            if (i >= str.length()) break;
            int start = i + 1;
            while (i < str.length() && str.charAt(i) != ']') i++;
            int end = i;
            String sub = str.substring(start, end).trim();
            List<String> argList = new ArrayList<>();
            if (!sub.isEmpty()) {
                for (String tok : sub.split(",")) {
                    argList.add(tok.trim().replace("\"", ""));
                }
            }
            res.add(argList);
            i = end + 1;
        }
        return res;
    }


// --- USER CODE ---

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
}

// --- MAIN ---
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        try {
            String line0 = reader.readLine();
            String line1 = reader.readLine();
            String[] operations = parseOpsJava(line0);
            List<List<String>> args = parseArgsJava(line1);
            LRUCache obj = null;
            List<String> results = new ArrayList<>();
            for (int i = 0; i < operations.length; i++) {
                String op = operations[i];
                List<String> arg = args.get(i);
                if (i == 0) {
                    obj = new LRUCache(Integer.parseInt(arg.get(0)));
                    results.add("null");
                } else {
                    if (op.equals("get")) {
                        Object res = obj.get(Integer.parseInt(arg.get(0)));
                        results.add(res == null ? "null" : res.toString());
                    }
                    else if (op.equals("put")) {
                        obj.put(Integer.parseInt(arg.get(0)), Integer.parseInt(arg.get(1)));
                        results.add("null");
                    }
                    else { results.add("null"); }
                }
            }
            StringBuilder sb = new StringBuilder("[");
            for (int idx = 0; idx < results.size(); idx++) {
                if (idx > 0) sb.append(",");
                sb.append(results.get(idx));
            }
            sb.append("]");
            System.out.println(sb.toString());
        } catch (Exception e) {
            System.err.println(e.getMessage());
            System.exit(1);
        }
    }
}
