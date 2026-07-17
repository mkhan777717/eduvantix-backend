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

    // CRIT-3: Parse methods for CLASS_DESIGN problems (LRU Cache, LFU Cache, etc.)
    // Without this, assemblyEngine gets undefined → empty array → no method dispatch generated
    let methods = [];
    if (problem.methods) {
      methods = typeof problem.methods === 'string'
        ? JSON.parse(problem.methods)
        : problem.methods;
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
      } else if (retType === 'LISTNODE') {
        // MED-1: Linked list problems compare token-by-token (e.g. "1 2 3" == "1 2 3")
        strategyId = 'token';
      }
      // ARRAY_INT/ARRAY_STRING return types use 'exact' by default
      // Problems that need order_insensitive must set comparator field in DB
    }

    return {
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      category: problem.category || 'FUNCTIONAL',
      parameters,
      methods,             // CRIT-3: Required by assemblyEngine for CLASS_DESIGN dispatch
      returnType: problem.returnType || 'INT',
      functionName: problem.functionName || 'solve',
      limits: {
        timeout: timeLimitMs,
        memoryLimitKb
      },
      judgeStrategy: strategyId,
      // MED-4: Expose problem's declared scoring model so pipeline uses the DB value,
      // not an arbitrary client-provided override
      scoringModel: problem.scoringModel || 'PARTIAL',
      metadata: {
        epsilon: problem.epsilon || 1e-6,
        customValidator: problem.customValidator || null
      }
    };

  }
}

module.exports = new ProblemLoader();
