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


    // H-4: timeout stored in DB as milliseconds. Enforce minimum of 1000ms.
    const timeLimitMs = problem.timeout
      ? Math.max(1000, parseInt(problem.timeout, 10))
      : 3000;
    const memoryLimitKb = problem.memoryLimit ? parseInt(problem.memoryLimit, 10) * 1024 : 256 * 1024; // Convert MB to KB

    // Resolve judge strategy — prefer explicit DB field, then comparator, then infer from return type.
    let strategyId = 'tokens';
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
      // ARRAY_INT/ARRAY_STRING return types use 'tokens' by default
    }

    // Parse methods for CLASS_DESIGN problems (LRU Cache, LFU Cache, etc.)
    let methods = [];
    if (problem.methods) {
      methods = typeof problem.methods === 'string'
        ? JSON.parse(problem.methods)
        : problem.methods;
    }

    return {
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      category: problem.category || 'FUNCTIONAL',
      parameters,
      methods,
      returnType: problem.returnType || 'INT',
      functionName: problem.functionName || 'solve',
      limits: {
        timeout: timeLimitMs,
        memoryLimitKb
      },
      judgeStrategy: strategyId,
      scoringModel: problem.scoringModel || 'PARTIAL',
      metadata: {
        epsilon: problem.epsilon || 1e-6,
        customValidator: problem.customValidator || null
      }
    };

  }
}

module.exports = new ProblemLoader();
