const { compareSet } = require("../../../services/comparator");

class SetStrategy {
  getName() { return "set"; }
  supports() { return true; }
  validateConfiguration() { return true; }
  judge(expectedOutput, actualOutput) {
    return compareSet(expectedOutput || "", actualOutput || "");
  }
}

module.exports = SetStrategy;
