class TokenStrategy {
  getName() {
    return 'token';
  }

  supports(problemMetadata) {
    return true;
  }

  validateConfiguration() {
    return true;
  }

  judge(expectedOutput, actualOutput, metadata) {
    const norm = (str) => (str || '').trim().replace(/,\s*/g, ',').split(/\s+/).filter(Boolean);
    const expectedTokens = norm(expectedOutput);
    const actualTokens = norm(actualOutput);

    if (expectedTokens.length !== actualTokens.length) {
      return false;
    }

    for (let i = 0; i < expectedTokens.length; i++) {
      if (expectedTokens[i].toLowerCase() !== actualTokens[i].toLowerCase()) {
        return false;
      }
    }
    return true;
  }
}

module.exports = TokenStrategy;
