/**
 * Boilerplate & Driver Generator Service
 * Generates stubs and driver codes dynamically from a problem's parameter/return schema.
 */

// Helper to map DB DataType to python types
const getPythonType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'float';
    case 'STRING': return 'str';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'str';
    case 'ARRAY_INT': return 'list[int]';
    case 'ARRAY_FLOAT': return 'list[float]';
    case 'ARRAY_STRING': return 'list[str]';
    case 'MATRIX_INT': return 'list[list[int]]';
    case 'MATRIX_FLOAT': return 'list[list[float]]';
    default: return 'any';
  }
};

// Helper to map DB DataType to C++ types
const getCppType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'double';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'char';
    case 'ARRAY_INT': return 'vector<int>';
    case 'ARRAY_FLOAT': return 'vector<double>';
    case 'ARRAY_STRING': return 'vector<string>';
    case 'MATRIX_INT': return 'vector<vector<int>>';
    case 'MATRIX_FLOAT': return 'vector<vector<double>>';
    default: return 'auto';
  }
};

// Helper to map DB DataType to Java types
const getJavaType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'double';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'boolean';
    case 'CHAR': return 'char';
    case 'ARRAY_INT': return 'int[]';
    case 'ARRAY_FLOAT': return 'double[]';
    case 'ARRAY_STRING': return 'String[]';
    case 'MATRIX_INT': return 'int[][]';
    case 'MATRIX_FLOAT': return 'double[][]';
    default: return 'Object';
  }
};

const getTypeScriptType = (type) => {
  switch (type) {
    case 'INT': return 'number';
    case 'FLOAT': return 'number';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'boolean';
    case 'CHAR': return 'string';
    case 'ARRAY_INT': return 'number[]';
    case 'ARRAY_FLOAT': return 'number[]';
    case 'ARRAY_STRING': return 'string[]';
    case 'MATRIX_INT': return 'number[][]';
    case 'MATRIX_FLOAT': return 'number[][]';
    default: return 'any';
  }
};

const getGoType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'float64';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'byte';
    case 'ARRAY_INT': return '[]int';
    case 'ARRAY_FLOAT': return '[]float64';
    case 'ARRAY_STRING': return '[]string';
    case 'MATRIX_INT': return '[][]int';
    case 'MATRIX_FLOAT': return '[][]float64';
    default: return 'interface{}';
  }
};

const getCSharpType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'double';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'char';
    case 'ARRAY_INT': return 'int[]';
    case 'ARRAY_FLOAT': return 'double[]';
    case 'ARRAY_STRING': return 'string[]';
    case 'MATRIX_INT': return 'int[][]';
    case 'MATRIX_FLOAT': return 'double[][]';
    default: return 'object';
  }
};

const getKotlinType = (type) => {
  switch (type) {
    case 'INT': return 'Int';
    case 'FLOAT': return 'Double';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'Boolean';
    case 'CHAR': return 'Char';
    case 'ARRAY_INT': return 'IntArray';
    case 'ARRAY_FLOAT': return 'DoubleArray';
    case 'ARRAY_STRING': return 'Array<String>';
    case 'MATRIX_INT': return 'Array<IntArray>';
    case 'MATRIX_FLOAT': return 'Array<DoubleArray>';
    default: return 'Any';
  }
};

const getSwiftType = (type) => {
  switch (type) {
    case 'INT': return 'Int';
    case 'FLOAT': return 'Double';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'Bool';
    case 'CHAR': return 'Character';
    case 'ARRAY_INT': return '[Int]';
    case 'ARRAY_FLOAT': return '[Double]';
    case 'ARRAY_STRING': return '[String]';
    case 'MATRIX_INT': return '[[Int]]';
    case 'MATRIX_FLOAT': return '[[Double]]';
    default: return 'Any';
  }
};

const getRustType = (type) => {
  switch (type) {
    case 'INT': return 'i32';
    case 'FLOAT': return 'f64';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'char';
    case 'ARRAY_INT': return 'Vec<i32>';
    case 'ARRAY_FLOAT': return 'Vec<f64>';
    case 'ARRAY_STRING': return 'Vec<String>';
    case 'MATRIX_INT': return 'Vec<Vec<i32>>';
    case 'MATRIX_FLOAT': return 'Vec<Vec<f64>>';
    default: return 'String';
  }
};

const getDartType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'double';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'bool';
    case 'CHAR': return 'String';
    case 'ARRAY_INT': return 'List<int>';
    case 'ARRAY_FLOAT': return 'List<double>';
    case 'ARRAY_STRING': return 'List<String>';
    case 'MATRIX_INT': return 'List<List<int>>';
    case 'MATRIX_FLOAT': return 'List<List<double>>';
    default: return 'dynamic';
  }
};

const getScalaType = (type) => {
  switch (type) {
    case 'INT': return 'Int';
    case 'FLOAT': return 'Double';
    case 'STRING': return 'String';
    case 'BOOLEAN': return 'Boolean';
    case 'CHAR': return 'Char';
    case 'ARRAY_INT': return 'Array[Int]';
    case 'ARRAY_FLOAT': return 'Array[Double]';
    case 'ARRAY_STRING': return 'Array[String]';
    case 'MATRIX_INT': return 'Array[Array[Int]]';
    case 'MATRIX_FLOAT': return 'Array[Array[Double]]';
    default: return 'Any';
  }
};

const getCType = (type) => {
  switch (type) {
    case 'INT': return 'int';
    case 'FLOAT': return 'double';
    case 'STRING': return 'char*';
    case 'BOOLEAN': return 'int';
    case 'CHAR': return 'char';
    default: return 'int';
  }
};

// Generate Boilerplate Stub (what the user sees in the editor)
const generateBoilerplate = (language, functionName, parameters, returnType) => {
  const langKey = language.toUpperCase();
  const paramNames = parameters.map(p => p.name).join(', ');

  switch (langKey) {
    case 'JAVASCRIPT':
      return `// Write your solution here\nfunction ${functionName}(${paramNames}) {\n    // Write your solution logic here\n    return -1;\n}`;

    case 'TYPESCRIPT': {
      const typedParams = parameters.map(p => `${p.name}: ${getTypeScriptType(p.type)}`).join(', ');
      return `// Write your solution here\nfunction ${functionName}(${typedParams}): ${getTypeScriptType(returnType)} {\n    // Write your solution logic here\n    return -1;\n}`;
    }

    case 'PYTHON': {
      const typedParams = parameters.map(p => `${p.name}: ${getPythonType(p.type)}`).join(', ');
      return `# Write your solution here\ndef ${functionName}(${typedParams}) -> ${getPythonType(returnType)}:\n    # Write your solution logic here\n    return -1`;
    }

    case 'CPP': {
      const typedParams = parameters.map(p => `${getCppType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\n${getCppType(returnType)} ${functionName}(${typedParams}) {\n    // Write your solution logic here\n    return -1;\n}`;
    }

    case 'C': {
      const typedParams = parameters.map(p => `${getCType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\n${getCType(returnType)} ${functionName}(${typedParams}) {\n    // Write your solution logic here\n    return -1;\n}`;
    }

    case 'JAVA': {
      const typedParams = parameters.map(p => `${getJavaType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\nclass Solution {\n    public ${getJavaType(returnType)} ${functionName}(${typedParams}) {\n        // Write your solution logic here\n        return -1;\n    }\n}`;
    }

    case 'GO': {
      const typedParams = parameters.map(p => `${p.name} ${getGoType(p.type)}`).join(', ');
      return `package main\n\n// Write your solution here\nfunc ${functionName}(${typedParams}) ${getGoType(returnType)} {\n\t// Write your solution logic here\n\treturn -1\n}`;
    }

    case 'CSHARP': {
      const typedParams = parameters.map(p => `${getCSharpType(p.type)} ${p.name}`).join(', ');
      const capFuncName = functionName.charAt(0).toUpperCase() + functionName.slice(1);
      return `using System;\nusing System.Collections.Generic;\n\n// Write your solution here\npublic class Solution {\n    public ${getCSharpType(returnType)} ${capFuncName}(${typedParams}) {\n        // Write your solution logic here\n        return -1;\n    }\n}`;
    }

    case 'KOTLIN': {
      const typedParams = parameters.map(p => `${p.name}: ${getKotlinType(p.type)}`).join(', ');
      return `// Write your solution here\nclass Solution {\n    fun ${functionName}(${typedParams}): ${getKotlinType(returnType)} {\n        // Write your solution logic here\n        return -1\n    }\n}`;
    }

    case 'SWIFT': {
      const typedParams = parameters.map(p => `${p.name}: ${getSwiftType(p.type)}`).join(', ');
      return `// Write your solution here\nclass Solution {\n    func ${functionName}(${typedParams}) -> ${getSwiftType(returnType)} {\n        // Write your solution logic here\n        return -1\n    }\n}`;
    }

    case 'RUST': {
      const typedParams = parameters.map(p => `${p.name}: ${getRustType(p.type)}`).join(', ');
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      return `// Write your solution here\nstruct Solution;\n\nimpl Solution {\n    pub fn ${snakeFuncName}(${typedParams}) -> ${getRustType(returnType)} {\n        // Write your solution logic here\n        -1\n    }\n}`;
    }

    case 'RUBY': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      return `# Write your solution here\ndef ${snakeFuncName}(${paramNames})\n    # Write your solution logic here\n    -1\nend`;
    }

    case 'PHP': {
      return `<?php\n// Write your solution here\nclass Solution {\n    function ${functionName}(${parameters.map(p => `$${p.name}`).join(', ')}) {\n        // Write your solution logic here\n        return -1;\n    }\n}`;
    }

    case 'DART': {
      const typedParams = parameters.map(p => `${getDartType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\nclass Solution {\n  ${getDartType(returnType)} ${functionName}(${typedParams}) {\n    // Write your solution logic here\n    return -1;\n  }\n}`;
    }

    case 'SCALA': {
      const typedParams = parameters.map(p => `${p.name}: ${getScalaType(p.type)}`).join(', ');
      return `// Write your solution here\nobject Solution {\n    def ${functionName}(${typedParams}): ${getScalaType(returnType)} = {\n        // Write your solution logic here\n        -1\n    }\n}`;
    }

    case 'ELIXIR': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      return `# Write your solution here\ndefmodule Solution do\n  def ${snakeFuncName}(${paramNames}) do\n    # Write your solution logic here\n    -1\n  end\nend`;
    }

    case 'ERLANG': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      return `-module(solution).\n-export([${snakeFuncName}/${parameters.length}]).\n\n% Write your solution here\n${snakeFuncName}(${parameters.map((_, i) => `Param${i+1}`).join(', ')}) ->\n    % Write your solution logic here\n    -1.`;
    }

    case 'RACKET': {
      const kebabFuncName = functionName.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
      return `; Write your solution here\n#lang racket\n\n(define (${kebabFuncName} ${paramNames})\n  ; Write your solution logic here\n  -1)`;
    }

    default:
      return `// Write your solution here\nfunction ${functionName}(${paramNames}) {\n    return -1;\n}`;
  }
};

/// Generate Driver Code Wrapper (executed on judge backend)
const generateDriverCode = (language, functionName, parameters, returnType, userCode) => {
  const langKey = language.toUpperCase();
  const paramNames = parameters.map(p => p.name).join(', ');

  switch (langKey) {
    case 'JAVASCRIPT':
    case 'TYPESCRIPT': {
      const parsingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `const ${p.name} = parseInt(lines[${idx}]);`;
        if (p.type === 'FLOAT') return `const ${p.name} = parseFloat(lines[${idx}]);`;
        if (p.type === 'STRING') return `const ${p.name} = lines[${idx}].replace(/^"(.*)"$/, '$1');`;
        if (p.type === 'BOOLEAN') return `const ${p.name} = lines[${idx}] === 'true' || lines[${idx}] === '1';`;
        if (p.type.startsWith('ARRAY') || p.type.startsWith('MATRIX')) return `const ${p.name} = JSON.parse(lines[${idx}]);`;
        return `const ${p.name} = lines[${idx}];`;
      }).join('\n    ');

      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nconst fs = require('fs');\n\nfunction main() {\n    const input = fs.readFileSync(0, 'utf-8').trim();\n    if (input) {\n        let lines = input.split(/\\r?\\n/);\n        if (lines.length < ${parameters.length}) {\n            lines = input.split(/\\s+/);\n        }\n        if (lines.length >= ${parameters.length}) {\n            ${parsingLines}\n            const result = ${functionName}(${paramNames});\n            console.log(typeof result === 'object' ? JSON.stringify(result) : result);\n        }\n    }\n}\nmain();`;
    }

    case 'PYTHON': {
      const parsingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = int(lines[${idx}].strip())`;
        if (p.type === 'FLOAT') return `${p.name} = float(lines[${idx}].strip())`;
        if (p.type === 'STRING') return `${p.name} = lines[${idx}].strip().strip('"')`;
        if (p.type === 'BOOLEAN') return `${p.name} = lines[${idx}].strip().lower() in ('true', '1')`;
        if (p.type.startsWith('ARRAY') || p.type.startsWith('MATRIX')) return `${p.name} = json.loads(lines[${idx}].strip())`;
        return `${p.name} = lines[${idx}].strip()`;
      }).join('\n            ');

      const sanitizedUserCode = userCode.replace(/\t/g, '    ');
      return `${sanitizedUserCode}\n\n# --- DRIVER CODE (AUTO-GENERATED) ---\nimport sys\nimport json\n\ndef main():\n    raw_input = sys.stdin.read().strip()\n    if raw_input:\n        lines = raw_input.splitlines()\n        if len(lines) < ${parameters.length}:\n            lines = raw_input.split()\n        if len(lines) >= ${parameters.length}:\n            ${parsingLines}\n            result = ${functionName}(${paramNames})\n            if isinstance(result, (list, dict)):\n                print(json.dumps(result))\n            else:\n                print(result)\n\nif __name__ == '__main__':\n    main()`;
    }

    case 'CPP': {
      const parsingDeclarations = parameters.map(p => `${getCppType(p.type)} ${p.name};`).join('\n    ');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'STRING') {
          return `getline(cin, ${p.name});\n    ${p.name}.erase(remove(${p.name}.begin(), ${p.name}.end(), '\\r'), ${p.name}.end());`;
        }
        if (p.type === 'ARRAY_INT') {
          return `string raw_${p.name};\n    getline(cin, raw_${p.name});\n    raw_${p.name}.erase(remove(raw_${p.name}.begin(), raw_${p.name}.end(), '\\r'), raw_${p.name}.end());\n    ${p.name} = parseVectorInt(raw_${p.name});`;
        }
        if (p.type === 'ARRAY_STRING') {
          return `string raw_${p.name};\n    getline(cin, raw_${p.name});\n    raw_${p.name}.erase(remove(raw_${p.name}.begin(), raw_${p.name}.end(), '\\r'), raw_${p.name}.end());\n    ${p.name} = parseVectorString(raw_${p.name});`;
        }
        if (p.type === 'MATRIX_INT') {
          return `string raw_${p.name};\n    getline(cin, raw_${p.name});\n    raw_${p.name}.erase(remove(raw_${p.name}.begin(), raw_${p.name}.end(), '\\r'), raw_${p.name}.end());\n    ${p.name} = parseMatrixInt(raw_${p.name});`;
        }
        return `string raw_${p.name};\n    getline(cin, raw_${p.name});\n    raw_${p.name}.erase(remove(raw_${p.name}.begin(), raw_${p.name}.end(), '\\r'), raw_${p.name}.end());\n    ${p.name} = ${p.type === 'INT' ? 'stoi' : 'stod'}(raw_${p.name});`;
      }).join('\n    ');

      const parsingHelpers = `
// Parsing Helper for integer array
vector<int> parseVectorInt(string str) {
    vector<int> res;
    str.erase(remove(str.begin(), str.end(), '['), str.end());
    str.erase(remove(str.begin(), str.end(), ']'), str.end());
    stringstream ss(str);
    string temp;
    while(getline(ss, temp, ',')) {
        if(!temp.empty()) res.push_back(stoi(temp));
    }
    return res;
}

// Parsing Helper for string array
vector<string> parseVectorString(string str) {
    vector<string> res;
    str.erase(remove(str.begin(), str.end(), '['), str.end());
    str.erase(remove(str.begin(), str.end(), ']'), str.end());
    stringstream ss(str);
    string temp;
    while(getline(ss, temp, ',')) {
        temp.erase(remove(temp.begin(), temp.end(), '"'), temp.end());
        temp.erase(remove(temp.begin(), temp.end(), '\\''), temp.end());
        if(!temp.empty()) {
            size_t first = temp.find_first_not_of(" ");
            size_t last = temp.find_last_not_of(" ");
            if(first != string::npos && last != string::npos) {
                res.push_back(temp.substr(first, last - first + 1));
            } else {
                res.push_back(temp);
            }
        }
    }
    return res;
}

// Parsing Helper for matrix of integers
vector<vector<int>> parseMatrixInt(string str) {
    vector<vector<int>> res;
    size_t pos = 0;
    while ((pos = str.find('[', pos)) != string::npos) {
        if (pos > 0 && str[pos-1] == '[') {
            pos++;
            continue; // Skip outer bracket
        }
        size_t end = str.find(']', pos);
        if (end != string::npos) {
            string sub = str.substr(pos + 1, end - pos - 1);
            stringstream ss(sub);
            string temp;
            vector<int> row;
            while (getline(ss, temp, ',')) {
                if (!temp.empty()) row.push_back(stoi(temp));
            }
            res.push_back(row);
            pos = end + 1;
        } else {
            break;
        }
    }
    return res;
}
`;

      return `#include <iostream>\n#include <string>\n#include <vector>\n#include <sstream>\n#include <algorithm>\n\nusing namespace std;\n${parsingHelpers}\n\n${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nint main() {\n    ${parsingDeclarations}\n    ${readingLines}\n    cout << ${functionName}(${paramNames}) << endl;\n    return 0;\n}`;
    }

    case 'C': {
      const parsingDeclarations = parameters.map(p => `${getCType(p.type)} ${p.name};`).join('\n    ');
      const readingLines = parameters.map((p) => {
        if (p.type === 'INT') return `scanf("%d", &${p.name});`;
        if (p.type === 'FLOAT') return `scanf("%lf", &${p.name});`;
        if (p.type === 'BOOLEAN') return `scanf("%d", &${p.name});`;
        if (p.type === 'CHAR') return `scanf(" %c", &${p.name});`;
        return `scanf("%d", &${p.name});`; // fallback
      }).join('\n    ');

      const printLine = (() => {
        switch (returnType) {
          case 'INT': return `printf("%d\\n", result);`;
          case 'FLOAT': return `printf("%.6f\\n", result);`;
          case 'BOOLEAN': return `printf("%s\\n", result ? "true" : "false");`;
          case 'CHAR': return `printf("%c\\n", result);`;
          default: return `printf("%d\\n", result);`;
        }
      })();

      return `#include <stdio.h>\n#include <string.h>\n#include <stdlib.h>\n\n${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nint main() {\n    ${parsingDeclarations}\n    ${readingLines}\n    ${getCType(returnType)} result = ${functionName}(${paramNames});\n    ${printLine}\n    return 0;\n}`;
    }

    case 'JAVA': {
      if (userCode.includes('class Main') || userCode.includes('public static void main')) {
        return userCode;
      }
      const parsingDeclarations = parameters.map(p => `${getJavaType(p.type)} ${p.name};`).join('\n        ');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = Integer.parseInt(sc.nextLine().trim());`;
        if (p.type === 'FLOAT') return `${p.name} = Double.parseDouble(sc.nextLine().trim());`;
        if (p.type === 'STRING') return `${p.name} = sc.nextLine().trim().replaceAll("^\\"|\\"$", "");`;
        if (p.type === 'BOOLEAN') return `${p.name} = Boolean.parseBoolean(sc.nextLine().trim());`;
        if (p.type === 'ARRAY_INT') return `String raw_${p.name} = sc.nextLine().trim();\n        ${p.name} = parseVectorInt(raw_${p.name});`;
        return `${p.name} = sc.nextLine().trim();`;
      }).join('\n        ');

      const parseHelper = `
    private static int[] parseVectorInt(String str) {
        str = str.replace("[", "").replace("]", "").trim();
        if (str.isEmpty()) return new int[0];
        String[] parts = str.split(",");
        int[] res = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            res[i] = Integer.parseInt(parts[i].trim());
        }
        return res;
    }
`;

      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nimport java.util.*;\n\npublic class Main {\n    ${parseHelper}\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        try {\n            ${parsingDeclarations}\n            ${readingLines}\n            Solution solver = new Solution();\n            System.out.println(solver.${functionName}(${paramNames}));\n        } catch (Exception e) {\n            e.printStackTrace();\n        }\n    }\n}`;
    }

    case 'GO': {
      if (userCode.includes('func main()')) {
        return userCode;
      }
      let goUserCode = userCode.replace(/^\s*package\s+main/g, '');
      const importRegex = /import\s+(?:"[^"]+"|\((?:[^)]|\n)*\))/g;
      const userImports = [];
      let match;
      while ((match = importRegex.exec(goUserCode)) !== null) {
        const block = match[0];
        const pkgs = block.match(/"[^"]+"/g) || [];
        userImports.push(...pkgs);
      }
      goUserCode = goUserCode.replace(importRegex, '');

      const driverPkgs = ['"fmt"', '"os"', '"bufio"', '"strings"', '"strconv"'];
      const allPkgs = Array.from(new Set([...driverPkgs, ...userImports]));

      const parsingDeclarations = parameters.map(p => {
        if (p.type === 'INT') return `var ${p.name} int`;
        if (p.type === 'FLOAT') return `var ${p.name} float64`;
        if (p.type === 'STRING') return `var ${p.name} string`;
        if (p.type === 'BOOLEAN') return `var ${p.name} bool`;
        if (p.type === 'ARRAY_INT') return `var ${p.name} []int`;
        return `var ${p.name} string`;
      }).join('\n    ');

      const readingLines = parameters.map((p, idx) => {
        let readLine = `raw_${p.name}, _ := reader.ReadString('\\n')\n    raw_${p.name} = strings.TrimSpace(raw_${p.name})`;
        if (p.type === 'INT') {
          return `${readLine}\n    val_${p.name}, _ := strconv.Atoi(raw_${p.name})\n    ${p.name} = val_${p.name}`;
        }
        if (p.type === 'FLOAT') {
          return `${readLine}\n    val_${p.name}, _ := strconv.ParseFloat(raw_${p.name}, 64)\n    ${p.name} = val_${p.name}`;
        }
        if (p.type === 'STRING') {
          return `${readLine}\n    ${p.name} = strings.Trim(raw_${p.name}, "\\\"")`;
        }
        if (p.type === 'BOOLEAN') {
          return `${readLine}\n    ${p.name} = raw_${p.name} == "true" || raw_${p.name} == "1"`;
        }
        if (p.type === 'ARRAY_INT') {
          return `${readLine}\n    ${p.name} = parseVectorInt(raw_${p.name})`;
        }
        return `${readLine}\n    ${p.name} = raw_${p.name}`;
      }).join('\n    ');

      const parseHelper = `
func parseVectorInt(str string) []int {
    str = strings.ReplaceAll(str, "[", "")
    str = strings.ReplaceAll(str, "]", "")
    str = strings.TrimSpace(str)
    if len(str) == 0 {
        return []int{}
    }
    parts := strings.Split(str, ",")
    var res []int
    for _, p := range parts {
        val, err := strconv.Atoi(strings.TrimSpace(p))
        if err == nil {
            res = append(res, val)
        }
    }
    return res
}
`;

      const importsBlock = `import (\n    ${allPkgs.join('\n    ')}\n)`;

      return `package main\n\n${importsBlock}\n\n${goUserCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\n${parseHelper}\n\nfunc main() {\n    reader := bufio.NewReader(os.Stdin)\n    ${parsingDeclarations}\n    ${readingLines}\n    result := ${functionName}(${paramNames})\n    fmt.Println(result)\n}`;
    }

    case 'CSHARP': {
      if (userCode.includes('public static void Main') || userCode.includes('static void Main')) {
        return userCode;
      }
      const capFuncName = functionName.charAt(0).toUpperCase() + functionName.slice(1);
      const parsingDeclarations = parameters.map(p => `${getCSharpType(p.type)} ${p.name};`).join('\n            ');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = int.Parse(Console.ReadLine().Trim());`;
        if (p.type === 'FLOAT') return `${p.name} = double.Parse(Console.ReadLine().Trim());`;
        if (p.type === 'STRING') return `${p.name} = Console.ReadLine().Trim().Replace("\"", "");`;
        if (p.type === 'BOOLEAN') return `${p.name} = bool.Parse(Console.ReadLine().Trim().ToLower());`;
        if (p.type === 'ARRAY_INT') return `string raw_${p.name} = Console.ReadLine().Trim();\n            ${p.name} = ParseArrayInt(raw_${p.name});`;
        return `${p.name} = Console.ReadLine().Trim();`;
      }).join('\n            ');

      const helpers = `
    private static int[] ParseArrayInt(string s) {
        s = s.Replace("[", "").Replace("]", "").Trim();
        if (string.IsNullOrEmpty(s)) return new int[0];
        return s.Split(',').Select(x => int.Parse(x.Trim())).ToArray();
    }
`;
      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nusing System;\nusing System.Collections.Generic;\nusing System.Linq;\n\npublic class DriverMain {\n    ${helpers}\n    public static void Main(string[] args) {\n        try {\n            ${parsingDeclarations}\n            ${readingLines}\n            Solution solver = new Solution();\n            var result = solver.${capFuncName}(${paramNames});\n            if (result is System.Collections.IEnumerable && !(result is string)) {\n                Console.WriteLine("[" + string.Join(",", ((System.Collections.IEnumerable)result).Cast<object>()) + "]");\n            } else {\n                Console.WriteLine(result);\n            }\n        } catch (Exception e) {\n            Console.Error.WriteLine(e.ToString());\n        }\n    }\n}`;
    }

    case 'KOTLIN': {
      if (userCode.includes('fun main(')) {
        return userCode;
      }
      const parsingDeclarations = parameters.map(p => `var ${p.name}: ${getKotlinType(p.type)}`).join('\n        ');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = readLine()!!.trim().toInt()`;
        if (p.type === 'FLOAT') return `${p.name} = readLine()!!.trim().toDouble()`;
        if (p.type === 'STRING') return `${p.name} = readLine()!!.trim().replace("\"", "")`;
        if (p.type === 'BOOLEAN') return `${p.name} = readLine()!!.trim().toBoolean()`;
        if (p.type === 'ARRAY_INT') return `val raw_${p.name} = readLine()!!.trim()\n        ${p.name} = parseKotlinArrayInt(raw_${p.name})`;
        return `${p.name} = readLine()!!.trim()`;
      }).join('\n        ');

      const helpers = `
fun parseKotlinArrayInt(s: String): IntArray {
    val clean = s.replace("[", "").replace("]", "").trim()
    if (clean.isEmpty()) return IntArray(0)
    return clean.split(",").map { it.trim().toInt() }.toIntArray()
}
`;
      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\n${helpers}\n\nfun main(args: Array<String>) {\n    try {\n        ${parsingDeclarations}\n        ${readingLines}\n        val solver = Solution()\n        val result = solver.${functionName}(${paramNames})\n        if (result is IntArray) {\n            println(result.joinToString(",", "[", "]"))\n        } else {\n            println(result)\n        }\n    } catch (e: Exception) {\n        e.printStackTrace()\n    }\n}`;
    }

    case 'SWIFT': {
      if (userCode.includes('func main(') || userCode.includes('CommandLine.arguments')) {
        return userCode;
      }
      const parsingDeclarations = parameters.map(p => `var ${p.name}: ${getSwiftType(p.type)}`).join('\n');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = Int(readLine()!.trimmingCharacters(in: .whitespacesAndNewlines))!`;
        if (p.type === 'FLOAT') return `${p.name} = Double(readLine()!.trimmingCharacters(in: .whitespacesAndNewlines))!`;
        if (p.type === 'STRING') return `${p.name} = readLine()!.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\"", with: "")`;
        if (p.type === 'BOOLEAN') return `${p.name} = readLine()!.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "true"`;
        if (p.type === 'ARRAY_INT') return `let raw_${p.name} = readLine()!.trimmingCharacters(in: .whitespacesAndNewlines)\n${p.name} = parseSwiftArrayInt(raw_${p.name})`;
        return `${p.name} = readLine()!.trimmingCharacters(in: .whitespacesAndNewlines)`;
      }).join('\n');

      const helpers = `
func parseSwiftArrayInt(_ s: String) -> [Int] {
    let clean = s.replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    if clean.isEmpty { return [] }
    return clean.split(separator: ",").map { Int($0.trimmingCharacters(in: .whitespacesAndNewlines))! }
}
`;
      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nimport Foundation\n${helpers}\n\n${parsingDeclarations}\n${readingLines}\nlet solver = Solution()\nlet result = solver.${functionName}(${paramNames})\nprint(result)`;
    }

    case 'RUST': {
      if (userCode.includes('fn main()')) {
        return userCode;
      }
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      
      const readingLines = parameters.map((p, idx) => {
        let readVar = `let mut line_${idx} = String::new();\n    io::stdin().read_line(&mut line_${idx}).unwrap();\n    let line_${idx} = line_${idx}.trim();`;
        if (p.type === 'INT') return `${readVar}\n    let ${p.name}: i32 = line_${idx}.parse().unwrap();`;
        if (p.type === 'FLOAT') return `${readVar}\n    let ${p.name}: f64 = line_${idx}.parse().unwrap();`;
        if (p.type === 'STRING') return `${readVar}\n    let ${p.name} = line_${idx}.replace("\"", "");`;
        if (p.type === 'BOOLEAN') return `${readVar}\n    let ${p.name}: bool = line_${idx}.to_lowercase() == "true" || line_${idx} == "1";`;
        if (p.type === 'ARRAY_INT') return `${readVar}\n    let ${p.name} = parse_rust_vec_int(line_${idx});`;
        return `${readVar}\n    let ${p.name} = line_${idx}.to_string();`;
      }).join('\n    ');

      const helpers = `
fn parse_rust_vec_int(s: &str) -> Vec<i32> {
    let clean = s.replace("[", "").replace("]", "");
    let clean = clean.trim();
    if clean.is_empty() { return Vec::new(); }
    clean.split(',').map(|x| x.trim().parse::<i32>().unwrap()).collect()
}
`;
      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nuse std::io;\n\n${helpers}\n\nfn main() {\n    ${readingLines}\n    let result = Solution::${snakeFuncName}(${paramNames});\n    println!("{:?}", result);\n}`;
    }

    case 'RUBY': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = gets.strip.to_i`;
        if (p.type === 'FLOAT') return `${p.name} = gets.strip.to_f`;
        if (p.type === 'STRING') return `${p.name} = gets.strip.gsub('"', '')`;
        if (p.type === 'BOOLEAN') return `${p.name} = gets.strip.downcase == "true"`;
        if (p.type === 'ARRAY_INT') return `${p.name} = gets.strip.gsub('[', '').gsub(']', '').split(',').map(&:to_i)`;
        return `${p.name} = gets.strip`;
      }).join('\n');

      return `${userCode}\n\n# --- DRIVER CODE (AUTO-GENERATED) ---\n${readingLines}\nresult = ${snakeFuncName}(${paramNames})\nif result.is_a?(Array)\n    puts "[" + result.join(",") + "]"\nelse\n    puts result\nend`;
    }

    case 'PHP': {
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `$${p.name} = (int)trim(fgets(STDIN));`;
        if (p.type === 'FLOAT') return `$${p.name} = (float)trim(fgets(STDIN));`;
        if (p.type === 'STRING') return `$${p.name} = str_replace('"', '', trim(fgets(STDIN)));`;
        if (p.type === 'BOOLEAN') return `$${p.name} = filter_var(trim(fgets(STDIN)), FILTER_VALIDATE_BOOLEAN);`;
        if (p.type === 'ARRAY_INT') return `$raw_${p.name} = trim(fgets(STDIN));\n$${p.name} = array_map('intval', explode(',', str_replace(['[', ']'], '', $raw_${p.name})));`;
        return `$${p.name} = trim(fgets(STDIN));`;
      }).join('\n');

      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\n${readingLines}\n$solver = new Solution();\n$result = $solver->${functionName}(${parameters.map(p => `$${p.name}`).join(', ')});\nif (is_array($result)) {\n    echo "[" . implode(',', $result) . "]\\n";\n} else {\n    echo $result . "\\n";\n}`;
    }

    case 'DART': {
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${getDartType(p.type)} ${p.name} = int.parse(stdin.readLineSync()!.trim());`;
        if (p.type === 'FLOAT') return `${getDartType(p.type)} ${p.name} = double.parse(stdin.readLineSync()!.trim());`;
        if (p.type === 'STRING') return `${getDartType(p.type)} ${p.name} = stdin.readLineSync()!.trim().replaceAll('"', '');`;
        if (p.type === 'BOOLEAN') return `${getDartType(p.type)} ${p.name} = stdin.readLineSync()!.trim().toLowerCase() == 'true';`;
        if (p.type === 'ARRAY_INT') return `${getDartType(p.type)} ${p.name} = stdin.readLineSync()!.trim().replaceAll('[', '').replaceAll(']', '').split(',').map((x) => int.parse(x.trim())).toList();`;
        return `${getDartType(p.type)} ${p.name} = stdin.readLineSync()!.trim();`;
      }).join('\n  ');

      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nimport 'dart:io';\n\nvoid main() {\n  ${readingLines}\n  var solver = Solution();\n  var result = solver.${functionName}(${paramNames});\n  print(result);\n}`;
    }

    case 'SCALA': {
      const parsingDeclarations = parameters.map(p => `var ${p.name}: ${getScalaType(p.type)} = _`).join('\n        ');
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `${p.name} = scala.io.StdIn.readLine().trim().toInt`;
        if (p.type === 'FLOAT') return `${p.name} = scala.io.StdIn.readLine().trim().toDouble`;
        if (p.type === 'STRING') return `${p.name} = scala.io.StdIn.readLine().trim().replace("\"", "")`;
        if (p.type === 'BOOLEAN') return `${p.name} = scala.io.StdIn.readLine().trim().toLowerCase.toBoolean`;
        if (p.type === 'ARRAY_INT') return `val raw_${p.name} = scala.io.StdIn.readLine().trim()\n        ${p.name} = raw_${p.name}.replace("[", "").replace("]", "").split(",").map(_.trim.toInt)`;
        return `${p.name} = scala.io.StdIn.readLine().trim()`;
      }).join('\n        ');

      return `${userCode}\n\n// --- DRIVER CODE (AUTO-GENERATED) ---\nobject Main {\n    def main(args: Array[String]): Unit = {\n        ${parsingDeclarations}\n        ${readingLines}\n        val result = Solution.${functionName}(${paramNames})\n        if (result.isInstanceOf[Array[Int]]) {\n            println(result.asInstanceOf[Array[Int]].mkString("[", ",", "]"))\n        } else {\n            println(result)\n        }\n    }\n}`;
    }

    case 'ELIXIR': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `raw_${idx} = IO.read(:line) |> String.trim()\n    {${p.name}, _} = Integer.parse(raw_${idx})`;
        if (p.type === 'FLOAT') return `raw_${idx} = IO.read(:line) |> String.trim()\n    {${p.name}, _} = Float.parse(raw_${idx})`;
        if (p.type === 'STRING') return `${p.name} = IO.read(:line) |> String.trim() |> String.replace("\"", "")`;
        if (p.type === 'BOOLEAN') return `${p.name} = (IO.read(:line) |> String.trim() |> String.downcase()) in ["true", "1"]`;
        if (p.type === 'ARRAY_INT') return `raw_${idx} = IO.read(:line) |> String.trim() |> String.replace("[", "") |> String.replace("]", "")\n    ${p.name} = String.split(raw_${idx}, ",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == "")) |> Enum.map(&String.to_integer/1)`;
        return `${p.name} = IO.read(:line) |> String.trim()`;
      }).join('\n    ');

      return `${userCode}\n\n# --- DRIVER CODE (AUTO-GENERATED) ---\ndefmodule Driver do\n  def main do\n    ${readingLines}\n    result = Solution.${snakeFuncName}(${paramNames})\n    IO.inspect(result)\n  end\nend\nDriver.main()`;
    }

    case 'ERLANG': {
      const snakeFuncName = functionName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `{ok, [Val_${idx}]} = io:fread("", "~d"),\n    Val_${idx}`;
        if (p.type === 'FLOAT') return `{ok, [Val_${idx}]} = io:fread("", "~f"),\n    Val_${idx}`;
        return `Line_${idx} = io:get_line(""),\n    string:trim(Line_${idx})`;
      });

      let block = `main() ->\n`;
      parameters.forEach((p, idx) => {
        block += `    Param_${idx} = ${readingLines[idx]},\n`;
      });
      block += `    Result = solution:${snakeFuncName}(${parameters.map((_, i) => `Param_${i}`).join(', ')}),\n`;
      block += `    io:format("~p~n", [Result]).`;

      return `${userCode}\n\n% --- DRIVER CODE (AUTO-GENERATED) ---\n${block}`;
    }

    case 'RACKET': {
      const kebabFuncName = functionName.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
      const readingLines = parameters.map((p, idx) => {
        if (p.type === 'INT') return `(define ${p.name} (string->number (string-trim (read-line))))`;
        if (p.type === 'FLOAT') return `(define ${p.name} (string->number (string-trim (read-line))))`;
        if (p.type === 'BOOLEAN') return `(define ${p.name} (string=? "true" (string-downcase (string-trim (read-line)))))`;
        return `(define ${p.name} (string-trim (read-line)))`;
      }).join('\n  ');

      return `${userCode}\n\n; --- DRIVER CODE (AUTO-GENERATED) ---\n(define (main)\n  ${readingLines}\n  (displayln (${kebabFuncName} ${paramNames})))\n(main)`;
    }

    default:
      return userCode;
  }
};

module.exports = {
  generateBoilerplate,
  generateDriverCode,
};
