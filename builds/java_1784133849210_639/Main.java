// --- IMPORTS ---
import java.io.*;
import java.util.*;

// --- RUNTIME ---
import java.util.*;

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


// --- HELPERS ---


// --- USER CODE ---

class Solution {
    public boolean isSameTree(TreeNode p, TreeNode q) {
        if (p == null && q == null) return true;
        if (p == null || q == null) return false;
        return p.val == q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
    }
}

// --- MAIN ---
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        try {
              String line0 = reader.readLine();
        TreeNode p = TreeHelper.deserialize(line0);
            String line1 = reader.readLine();
        TreeNode q = TreeHelper.deserialize(line1);
            Solution solver = new Solution();
            boolean result = solver.isSameTree(p, q);
              System.out.println(String.valueOf(result));
              
        } catch (Exception e) {
              System.err.println(e.getMessage());
              System.exit(1);
        }
    }
}
