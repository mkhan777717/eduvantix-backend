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

// Generate Boilerplate Stub (what the user sees in the editor)
const generateBoilerplate = (language, functionName, parameters, returnType) => {
  const langKey = language.toUpperCase();
  const paramNames = parameters.map(p => p.name).join(', ');

  switch (langKey) {
    case 'JAVASCRIPT':
    case 'TYPESCRIPT': {
      const typeAnnotation = langKey === 'TYPESCRIPT' 
        ? `: ${parameters.map(p => `${p.name}: any`).join(', ')}`
        : '';
      return `// Write your solution here\nfunction ${functionName}(${paramNames}) {\n    // Write your solution logic here\n    return -1;\n}`;
    }

    case 'PYTHON': {
      const typedParams = parameters.map(p => `${p.name}: ${getPythonType(p.type)}`).join(', ');
      return `# Write your solution here\ndef ${functionName}(${typedParams}) -> ${getPythonType(returnType)}:\n    # Write your solution logic here\n    return -1`;
    }

    case 'CPP': {
      const typedParams = parameters.map(p => `${getCppType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\n${getCppType(returnType)} ${functionName}(${typedParams}) {\n    // Write your solution logic here\n    return -1;\n}`;
    }

    case 'JAVA': {
      const typedParams = parameters.map(p => `${getJavaType(p.type)} ${p.name}`).join(', ');
      return `// Write your solution here\nclass Solution {\n    public ${getJavaType(returnType)} ${functionName}(${typedParams}) {\n        // Write your solution logic here\n        return -1;\n    }\n}`;
    }

    case 'GO': {
      const typedParams = parameters.map(p => `${p.name} ${p.type.includes('ARRAY') ? '[]interface{}' : 'interface{}'}`).join(', ');
      return `package main\n\n// Write your solution here\nfunc ${functionName}(${typedParams}) int {\n\t// Write your solution logic here\n\treturn -1\n}`;
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

      // Remove package main if present (we will write our own package main header with merged imports)
      let goUserCode = userCode.replace(/^\s*package\s+main/g, '');

      // Parse user imports and merge with driver imports to avoid duplicates/failures
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

    default:
      // Fallback to JS wrapper
      return userCode;
  }
};

module.exports = {
  generateBoilerplate,
  generateDriverCode,
};
