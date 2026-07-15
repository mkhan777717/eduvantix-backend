import java.util.*;

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

    // Collection Parsers
    public static int[] parseVectorInt(String str) {
        if (str == null) return new int[0];
        str = str.replace("[", "").replace("]", "").replace(" ", "");
        if (str.isEmpty()) return new int[0];
        String[] tokens = str.split(",");
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
        str = str.replace("[", "").replace("]", "").replace(" ", "");
        if (str.isEmpty()) return new double[0];
        String[] tokens = str.split(",");
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
        str = str.replace("[", "").replace("]", "").replace(" ", "");
        if (str.isEmpty()) return new boolean[0];
        String[] tokens = str.split(",");
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
