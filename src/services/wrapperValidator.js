class WrapperValidator {
  /**
   * Asserts structural correctness of generated source files before saving / compiling.
   * @param {string} generatedSource - The compiled consolidated code
   * @returns {boolean} True if validation succeeds
   * @throws {Error} Descriptive error on template structural failures
   */
  validate(generatedSource) {
    if (!generatedSource || generatedSource.trim() === '') {
      throw new Error('Wrapper validation failed: Generated source code is empty.');
    }

    // Check for any unresolved template placeholders matching the format {{TAG}}
    const unresolvedTokenRegex = /\{\{[A-Z0-9_]+\}\}/g;
    const matches = generatedSource.match(unresolvedTokenRegex);

    if (matches && matches.length > 0) {
      const uniqueUnresolved = Array.from(new Set(matches));
      throw new Error(`Wrapper validation failed: Unresolved double-brace placeholders remain: [${uniqueUnresolved.join(', ')}].`);
    }

    // M-3: Also check for known single-brace placeholders that were not substituted
    const knownSingleBrace = /\{(functionName|paramNames|returnTypeName|typeName|paramName|deserialize|varName|serializeExpr)\}/g;
    const singleMatches = generatedSource.match(knownSingleBrace);
    if (singleMatches && singleMatches.length > 0) {
      const uniqueSingle = Array.from(new Set(singleMatches));
      throw new Error(`Wrapper validation failed: Unresolved template placeholders remain: [${uniqueSingle.join(', ')}]. This indicates a code assembly bug.`);
    }

    return true;
  }
}

module.exports = new WrapperValidator();
