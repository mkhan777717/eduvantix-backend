// --- IMPORTS ---
const fs = require('fs');

// --- RUNTIME ---
class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }

  static deserialize(data) {
    if (!data) return null;
    const tokens = typeof data === 'string' ? JSON.parse(data) : data;
    if (!tokens || tokens.length === 0 || tokens[0] === null) return null;

    const root = new TreeNode(Number(tokens[0]));
    const q = [root];
    let i = 1;

    while (q.length > 0 && i < tokens.length) {
      const curr = q.shift();

      if (i < tokens.length) {
        if (tokens[i] !== null && tokens[i] !== 'null') {
          curr.left = new TreeNode(Number(tokens[i]));
          q.push(curr.left);
        }
        i++;
      }
      if (i < tokens.length) {
        if (tokens[i] !== null && tokens[i] !== 'null') {
          curr.right = new TreeNode(Number(tokens[i]));
          q.push(curr.right);
        }
        i++;
      }
    }
    return root;
  }

  static serialize(root) {
    if (!root) return "[]";
    const res = [];
    const q = [root];

    while (q.length > 0) {
      const curr = q.shift();
      if (curr) {
        res.push(curr.val);
        q.push(curr.left);
        q.push(curr.right);
      } else {
        res.push(null);
      }
    }

    while (res.length > 0 && res[res.length - 1] === null) {
      res.pop();
    }

    return JSON.stringify(res);
  }
}

if (typeof module !== 'undefined') {
  module.exports = TreeNode;
}


// --- HELPERS ---


// --- USER CODE ---

function isSameTree(p, q) {
    if (!p && !q) return true;
    if (!p || !q) return false;
    return p.val === q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}

// --- MAIN ---
function main() {
    const fs = require('fs');
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    if (!rawInput) return;
    const lines = rawInput.split(/\r?\n/);
    try {
          let p;
    if (lines.length > 0) {
        p = TreeNode.deserialize(lines[0].trim());
    }
        let q;
    if (lines.length > 1) {
        q = TreeNode.deserialize(lines[1].trim());
    }
        const result = isSameTree(p, q);
          console.log(String(result));
    } catch (e) {
          console.error(e);
          process.exit(1);
    }
}
main();
