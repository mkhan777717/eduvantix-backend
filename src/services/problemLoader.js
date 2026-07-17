const prisma = require('../prisma');

class ProblemLoader {
  /**
   * Loads problem metadata and normalizes parameter/limit specs from the DB.
   * @param {number} problemId
   * @returns {Promise<Object>} Normalized problemMeta
   */
  async loadProblem(problemId) {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId }
    });

    if (!problem) {
      throw new Error(`Problem not found for ID: ${problemId}`);
    }

    // Parse parameters list
    let parameters = [];
    if (problem.parameters) {
      parameters = typeof problem.parameters === 'string'
        ? JSON.parse(problem.parameters)
        : problem.parameters;
    }

    // H-4: timeLimit stored in DB as seconds — convert to milliseconds. Enforce minimum of 1000ms.
    const timeLimitMs = problem.timeLimit
      ? Math.max(1000, parseInt(problem.timeLimit, 10) * 1000)
      : 3000;
    const memoryLimitKb = problem.memoryLimit ? parseInt(problem.memoryLimit, 10) * 1024 : 256 * 1024; // Convert MB to KB

    // Resolve judge strategy ID: exact, float, token, tree, graph, order_insensitive, set, special.
    // Default to exact.
    let strategyId = 'exact';
    if (problem.judgeStrategy) {
      strategyId = problem.judgeStrategy.toLowerCase();
    } else if (problem.comparator) {
      strategyId = problem.comparator.toLowerCase();
    } else {
      // M-6: Infer strategy from return type
      const retType = (problem.returnType || '').toUpperCase();
      if (retType === 'TREENODE') {
        strategyId = 'tree';
      } else if (retType === 'GRAPHNODE') {
        strategyId = 'graph';
      } else if (retType === 'FLOAT' || retType === 'DOUBLE') {
        strategyId = 'float';
      }
      // ARRAY_INT/ARRAY_STRING return types use 'tokens' by default (order-sensitive)
      // Problems that need order_insensitive must set comparator field in DB
    }

    return {
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      category: problem.category || 'FUNCTIONAL',
      parameters,
      returnType: problem.returnType || 'INT',
      functionName: problem.functionName || 'solve',
      limits: {
        timeout: timeLimitMs,
        memoryLimitKb
      },
      judgeStrategy: strategyId,
      metadata: {
        epsilon: problem.epsilon || 1e-6,
        customValidator: problem.customValidator || null
      }
    };
  }
}

module.exports = new ProblemLoader();
