const { compareOrderInsensitive } = require("../../../services/comparator");

class OrderInsensitiveStrategy {
  getName() { return "order_insensitive"; }
  supports() { return true; }
  validateConfiguration() { return true; }
  judge(expectedOutput, actualOutput) {
    return compareOrderInsensitive(expectedOutput || "", actualOutput || "");
  }
}

module.exports = OrderInsensitiveStrategy;
