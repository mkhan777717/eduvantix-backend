const path = require('path');
const languageRegistry = require('./languageRegistry');
const driverRegistry = require('./driverRegistry');
const dependencyResolver = require('./dependencyResolver');
const runtimeResolver = require('./runtimeResolver');
const templateRenderer = require('./templateRenderer');
const wrapperValidator = require('./wrapperValidator');

class AssemblyEngine {
  /**
   * Orchestrates the loading, resolving, rendering, and validation of solution code.
   * @param {string} language - Target language e.g. "cpp", "python", "javascript", "java", "go", "c"
   * @param {string} userCode - Raw user code snippet
   * @param {Object} problemMeta - Problem spec mapping { category, parameters, returnType, functionName }
   * @returns {string} Assembled source code ready for sandbox compile/run
   */
  assembleCode(language, userCode, problemMeta) {
    if (!language || !userCode || !problemMeta) {
      throw new Error('Language, userCode, and problemMeta are required to assemble code.');
    }

    const lang = language.toLowerCase();
    const category = (problemMeta.category || 'FUNCTIONAL').toUpperCase();

    // 1. Resolve Language details
    if (!languageRegistry.hasLanguage(lang)) {
      throw new Error(`Unsupported language requested for assembly: ${language}`);
    }

    // 2. Resolve Driver Template
    if (!driverRegistry.hasDriver(category, lang)) {
      throw new Error(`Driver template for category '${category}' and language '${language}' is not registered.`);
    }
    const driverTemplate = driverRegistry.getDriver(category, lang);

    // 3. Resolve Parameter & Type dependencies
    const { runtimes, typeDefinitions } = dependencyResolver.resolveDependencies(
      problemMeta.parameters,
      problemMeta.returnType,
      lang
    );

    // 4. Resolve and combine Runtime Structural Libraries
    const runtimeCodes = [];
    const processedRuntimes = new Set();
    
    for (const runtime of runtimes) {
      const runtimeKey = `${runtime.structure}:${runtime.version}`;
      if (!processedRuntimes.has(runtimeKey)) {
        processedRuntimes.add(runtimeKey);
        const resolved = runtimeResolver.resolveRuntime(runtime.structure, runtime.version, lang);
        let content = resolved.content;
        if (lang === 'go') {
          content = content.replace(/package\s+main/g, '');
          content = content.replace(/import\s*\(([\s\S]*?)\)/g, '');
          content = content.replace(/import\s+"[^"]+"/g, '');
        }
        runtimeCodes.push(content);
      }
    }

    // 5. Build dynamic code parts (Execution and Printing block)
    const functionName = problemMeta.functionName || 'solve';
    const executionParts = [];
    const printParts = [];
    const cleanupParts = [];
    const paramNames = [];

    // Parameter declarations and reading logic
    problemMeta.parameters.forEach((param, idx) => {
      const typeDef = typeDefinitions.get(param.name);
      paramNames.push(param.name);

      if (lang === 'cpp') {
        const inputVar = `line${idx}`;
        executionParts.push(
          `string ${inputVar};\n    ` +
          `if (getline(cin, ${inputVar})) {\n        ` +
          `// Remove trailing CR if present on Windows host\n        ` +
          `if (!${inputVar}.empty() && ${inputVar}.back() == '\\r') ${inputVar}.pop_back();\n    }\n    ` +
          `${typeDef.typeName} ${param.name} = ${typeDef.deserialize.replace(/{varName}/g, inputVar)};`
        );
      } else if (lang === 'python') {
        executionParts.push(
          `if len(lines) > ${idx}:\n                ` +
          `${param.name} = ${typeDef.deserialize.replace(/{varName}/g, `lines[${idx}].strip()`)}`
        );
      } else if (lang === 'javascript') {
        executionParts.push(
          `let ${param.name};\n    if (lines.length > ${idx}) {\n        ` +
          `${param.name} = ${typeDef.deserialize.replace(/{varName}/g, `lines[${idx}].trim()`)};\n    }`
        );
      } else if (lang === 'java') {
        executionParts.push(
          `String line${idx} = reader.readLine();\n        ` +
          `${typeDef.typeName} ${param.name} = ${typeDef.deserialize.replace(/{varName}/g, `line${idx}`)};`
        );
      } else if (lang === 'go') {
        executionParts.push(
          `var line${idx} string;\n    ` +
          `if scanner.Scan() {\n        ` +
          `line${idx} = scanner.Text();\n    }\n    ` +
          `${param.name} := ${typeDef.deserialize.replace(/{varName}/g, `line${idx}`)}`
        );
      } else if (lang === 'c') {
        executionParts.push(
          `static char line${idx}[1048576];\n    ` +
          `if (fgets(line${idx}, sizeof(line${idx}), stdin)) {\n        ` +
          `size_t len = strlen(line${idx});\n        ` +
          `if (len > 0 && line${idx}[len-1] == '\\n') line${idx}[len-1] = '\\0';\n        ` +
          `if (len > 1 && line${idx}[len-2] == '\\r') line${idx}[len-2] = '\\0';\n    }\n    ` +
          `${typeDef.typeName} ${param.name} = ${typeDef.deserialize.replace(/{varName}/g, `line${idx}`)};`
        );
      }

      // Memory cleanup declarations
      if (typeDef.cleanup) {
        cleanupParts.push(typeDef.cleanup.replace(/{varName}/g, param.name) + ";");
      }
    });

    const returnTypeDef = typeDefinitions.get('__return__');

    // Execution call
    if (lang === 'cpp') {
      executionParts.push('Solution solver;');
      const returnTypeName = returnTypeDef ? returnTypeDef.typeName : 'void';
      if (returnTypeName !== 'void') {
        executionParts.push(`${returnTypeName} result = solver.${functionName}(${paramNames.join(', ')});`);
      } else {
        executionParts.push(`solver.${functionName}(${paramNames.join(', ')});`);
      }
    } else if (lang === 'python') {
      executionParts.push('solver = Solution()');
      if (returnTypeDef) {
        executionParts.push(`result = solver.${functionName}(${paramNames.join(', ')})`);
      } else {
        executionParts.push(`solver.${functionName}(${paramNames.join(', ')})`);
      }
    } else if (lang === 'javascript') {
      if (returnTypeDef) {
        executionParts.push(`const result = ${functionName}(${paramNames.join(', ')});`);
      } else {
        executionParts.push(`${functionName}(${paramNames.join(', ')});`);
      }
    } else if (lang === 'java') {
      executionParts.push('Solution solver = new Solution();');
      const returnTypeName = returnTypeDef ? returnTypeDef.typeName : 'void';
      if (returnTypeName !== 'void') {
        executionParts.push(`${returnTypeName} result = solver.${functionName}(${paramNames.join(', ')});`);
      } else {
        executionParts.push(`solver.${functionName}(${paramNames.join(', ')});`);
      }
    } else if (lang === 'go') {
      const returnTypeName = returnTypeDef ? returnTypeDef.typeName : '';
      if (returnTypeName !== '') {
        executionParts.push(`result := ${functionName}(${paramNames.join(', ')})`);
      } else {
        executionParts.push(`${functionName}(${paramNames.join(', ')})`);
      }
    } else if (lang === 'c') {
      const returnTypeName = returnTypeDef ? returnTypeDef.typeName : 'void';
      if (returnTypeName !== 'void') {
        executionParts.push(`${returnTypeName} result = ${functionName}(${paramNames.join(', ')});`);
      } else {
        executionParts.push(`${functionName}(${paramNames.join(', ')});`);
      }
    }

    // Print block and result serializations
    if (returnTypeDef) {
      const serializeExpr = returnTypeDef.serialize.replace(/{varName}/g, 'result');
      if (lang === 'cpp') {
        printParts.push(`cout << ${serializeExpr} << endl;`);
      } else if (lang === 'python') {
        printParts.push(`print(${serializeExpr})`);
      } else if (lang === 'javascript') {
        printParts.push(`console.log(${serializeExpr});`);
      } else if (lang === 'java') {
        printParts.push(`System.out.println(${serializeExpr});`);
      } else if (lang === 'go') {
        printParts.push(`fmt.Println(${serializeExpr})`);
      } else if (lang === 'c') {
        printParts.push(`printf("%s\\n", ${serializeExpr});`);
      }

      if (returnTypeDef.cleanup) {
        cleanupParts.push(returnTypeDef.cleanup.replace(/{varName}/g, 'result') + ";");
      }
    }

    // Assemble language specific main() body
    let mainBody = '';
    if (lang === 'cpp') {
      mainBody = `int main() {\n    ` +
        `${executionParts.join('\n    ')}\n    ` +
        `${printParts.join('\n    ')}\n    ` +
        `${cleanupParts.join('\n    ')}\n    ` +
        `return 0;\n}`;
    } else if (lang === 'python') {
      mainBody = `def main():\n    ` +
        `import sys\n    ` +
        `raw_input = sys.stdin.read().strip()\n    ` +
        `if not raw_input:\n        ` +
        `return\n    ` +
        `lines = raw_input.splitlines()\n    ` +
        `try:\n        ` +
        `    ${executionParts.join('\n            ')}\n        ` +
        `    ${printParts.join('\n            ')}\n    ` +
        `except Exception as e:\n        ` +
        `  sys.stderr.write(str(e))\n        ` +
        `  sys.exit(1)\n\n` +
        `if __name__ == '__main__':\n    ` +
        `main()`;
    } else if (lang === 'javascript') {
      mainBody = `function main() {\n    ` +
        `const fs = require('fs');\n    ` +
        `const rawInput = fs.readFileSync(0, 'utf-8').trim();\n    ` +
        `if (!rawInput) return;\n    ` +
        `const lines = rawInput.split(/\\r?\\n/);\n    ` +
        `try {\n        ` +
        `  ${executionParts.join('\n        ')}\n        ` +
        `  ${printParts.join('\n        ')}\n    ` +
        `} catch (e) {\n        ` +
        `  console.error(e);\n        ` +
        `  process.exit(1);\n    ` +
        `}\n}\n` +
        `main();`;
    } else if (lang === 'java') {
      mainBody = `BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n        ` +
        `try {\n            ` +
        `  ${executionParts.join('\n            ')}\n            ` +
        `  ${printParts.join('\n            ')}\n            ` +
        `  ${cleanupParts.join('\n            ')}\n        ` +
        `} catch (Exception e) {\n            ` +
        `  System.err.println(e.getMessage());\n            ` +
        `  System.exit(1);\n        ` +
        `}`;
    } else if (lang === 'go') {
      mainBody = `func main() {\n    ` +
        `scanner := bufio.NewScanner(os.Stdin)\n    ` +
        `buf := make([]byte, 1024*1024)\n    ` +
        `scanner.Buffer(buf, 1024*1024)\n    ` +
        `_ = strconv.Itoa(0)\n    ` +
        `_ = strings.TrimSpace("")\n    ` +
        `${executionParts.join('\n    ')}\n    ` +
        `${printParts.join('\n    ')}\n    ` +
        `${cleanupParts.join('\n    ')}\n}`;
    } else if (lang === 'c') {
      mainBody = `int main() {\n    ` +
        `${executionParts.join('\n    ')}\n    ` +
        `${printParts.join('\n    ')}\n    ` +
        `${cleanupParts.join('\n    ')}\n    ` +
        `return 0;\n}`;
    }

    // Standard imports mapping
    let importsBlock = '';
    if (lang === 'python') {
      importsBlock = 'import sys\nimport json\nfrom typing import Optional, List';
    } else if (lang === 'javascript') {
      importsBlock = "const fs = require('fs');";
    } else if (lang === 'java') {
      importsBlock = 'import java.io.*;\nimport java.util.*;';
    } else if (lang === 'go') {
      importsBlock = 'import (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strconv"\n\t"strings"\n)';
    } else if (lang === 'c') {
      importsBlock = '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <stdbool.h>';
    }

    // 6. Template replacements Map
    const replacements = {
      '{{IMPORTS}}': importsBlock,
      '{{RUNTIME}}': runtimeCodes.join('\n\n'),
      '{{HELPERS}}': '',
      '{{USER_CODE}}': userCode,
      '{{MAIN}}': mainBody
    };

    // Render templates
    const assembledSource = templateRenderer.render(driverTemplate, replacements);

    // 7. Validate generated source code health
    wrapperValidator.validate(assembledSource);

    return assembledSource;
  }
}

module.exports = new AssemblyEngine();
