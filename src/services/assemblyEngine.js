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
   * @param {Object} problemMeta - Problem spec mapping { category, parameters, returnType, functionName, methods }
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
    const langConfig = languageRegistry.getLanguage(lang);

    // 2. Resolve Driver Template
    if (!driverRegistry.hasDriver(category, lang)) {
      throw new Error(`Driver template for category '${category}' and language '${language}' is not registered.`);
    }
    const driverTemplate = driverRegistry.getDriver(category, lang);

    // 3. Resolve Parameter & Type dependencies (only for Functional problems, Class Design resolves constructor/methods)
    const parameters = problemMeta.parameters || [];
    const returnType = problemMeta.returnType;
    const { runtimes, typeDefinitions } = dependencyResolver.resolveDependencies(
      category === 'CLASS_DESIGN' ? [] : parameters,
      category === 'CLASS_DESIGN' ? null : returnType,
      lang
    );

    // 4. Resolve and combine Runtime Structural Libraries
    const runtimeCodes = [];
    const processedRuntimes = new Set();

    // Always include runtime libraries configured in language if required
    const targetRuntimes = [...runtimes];
    if (category === 'CLASS_DESIGN') {
      // For class design, force resolve tree/list/graph runtimes if mentioned in language config
      const defaultLibs = langConfig.runtimeLibraries || [];
      for (const lib of defaultLibs) {
        targetRuntimes.push({ structure: lib, version: 'v1' });
      }
    }

    for (const runtime of targetRuntimes) {
      const runtimeKey = `${runtime.structure}:${runtime.version}`;
      if (!processedRuntimes.has(runtimeKey)) {
        processedRuntimes.add(runtimeKey);
        try {
          const resolved = runtimeResolver.resolveRuntime(runtime.structure, runtime.version, lang);
          let content = resolved.content;
          if (langConfig.runtimeLibraryCleanupRegexes && langConfig.runtimeLibraryCleanupRegexes.length > 0) {
            for (const regexStr of langConfig.runtimeLibraryCleanupRegexes) {
              const regex = new RegExp(regexStr, 'g');
              content = content.replace(regex, '');
            }
          }
          runtimeCodes.push(content);
        } catch (_) {
          // Runtime not available or needed for this specific language, skip gracefully
        }
      }
    }

    // 5. Build dynamic code parts (Execution, Printing, and Helper blocks)
    let executionParts = [];
    let printParts = [];
    let cleanupParts = [];
    let helpersBlock = '';

    if (category === 'CLASS_DESIGN') {
      const classDesignData = this.buildClassDesignParts(lang, problemMeta);
      executionParts = classDesignData.executionParts;
      printParts = classDesignData.printParts;
      cleanupParts = classDesignData.cleanupParts;
      helpersBlock = classDesignData.helpersBlock;
    } else {
      const functionName = problemMeta.functionName || 'solve';
      const paramNames = [];

      parameters.forEach((param, idx) => {
        const typeDef = typeDefinitions.get(param.name);
        paramNames.push(param.name);

        const paramReadPart = langConfig.parameterReadTemplate
          .replace(/{idx}/g, String(idx))
          .replace(/{typeName}/g, typeDef.typeName)
          .replace(/{paramName}/g, param.name)
          .replace(/{deserialize}/g, typeDef.deserialize.replace(/{varName}/g, langConfig.inputVarTemplate.replace(/{idx}/g, String(idx))));

        executionParts.push(paramReadPart);

        // Memory cleanup declarations
        if (typeDef.cleanup) {
          cleanupParts.push(typeDef.cleanup.replace(/{varName}/g, param.name) + ";");
        }
      });

      const returnTypeDef = typeDefinitions.get('__return__');
      const returnTypeName = returnTypeDef ? returnTypeDef.typeName : 'void';

      // Execution call
      let execPart = '';
      if (returnTypeName !== 'void' && returnTypeName !== '') {
        let template = langConfig.executionCallTemplate;
        if (language.toLowerCase() === 'cpp' && !userCode.includes('class Solution')) {
          template = "{returnTypeName} result = {functionName}({paramNames});";
        }
        execPart = template
          .replace(/{returnTypeName}/g, returnTypeName)
          .replace(/{functionName}/g, functionName)
          .replace(/{paramNames}/g, paramNames.join(', '));
      } else {
        let template = langConfig.executionCallVoidTemplate;
        if (language.toLowerCase() === 'cpp' && !userCode.includes('class Solution')) {
          template = "{functionName}({paramNames});";
        }
        execPart = template
          .replace(/{functionName}/g, functionName)
          .replace(/{paramNames}/g, paramNames.join(', '));
      }
      executionParts.push(execPart);

      // Print block and result serializations
      if (returnTypeDef) {
        const serializeExpr = returnTypeDef.serialize.replace(/{varName}/g, 'result');
        const printPart = langConfig.printTemplate.replace(/{serializeExpr}/g, serializeExpr);
        printParts.push(printPart);

        if (returnTypeDef.cleanup) {
          cleanupParts.push(returnTypeDef.cleanup.replace(/{varName}/g, 'result') + ";");
        }
      }
    }

    // Assemble language specific main() body using the smart indentation replace helper
    let mainBody = langConfig.mainBodyTemplate;
    mainBody = this.replacePlaceholder(mainBody, '{executionParts}', executionParts);
    mainBody = this.replacePlaceholder(mainBody, '{printParts}', printParts);
    mainBody = this.replacePlaceholder(mainBody, '{cleanupParts}', cleanupParts);
    mainBody = mainBody.replace(/{parametersLength}/g, String(parameters.length));

    // 6. Template replacements Map
    const replacements = {
      '{{IMPORTS}}': langConfig.imports || '',
      '{{RUNTIME}}': runtimeCodes.join('\n\n'),
      '{{HELPERS}}': helpersBlock,
      '{{USER_CODE}}': userCode,
      '{{MAIN}}': mainBody
    };

    // Render templates
    const assembledSource = templateRenderer.render(driverTemplate, replacements);

    // 7. Validate generated source code health
    wrapperValidator.validate(assembledSource);

    return assembledSource;
  }

  /**
   * Helper to replace placeholders in main body template while preserving correct relative indentation.
   */
  replacePlaceholder(template, placeholder, contentLines) {
    const placeholderRegex = new RegExp(`\\s*${placeholder}`);
    const lines = template.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(placeholderRegex);
      if (match) {
        const leadingSpaces = lines[i].match(/^(\s*)/)[1];
        if (contentLines.length === 0) {
          lines.splice(i, 1);
          i--;
        } else {
          const replaced = contentLines.map(block => {
            return block.split('\n').map(line => leadingSpaces + line).join('\n');
          }).join('\n');
          lines[i] = replaced;
        }
      }
    }
    return lines.join('\n');
  }

  /**
   * Builds Class Design structures dynamically for compilation.
   */
  buildClassDesignParts(lang, problemMeta) {
    const className = problemMeta.functionName || 'LRUCache';
    const methods = problemMeta.methods || [];
    const executionParts = [];
    let printParts = [];
    const cleanupParts = [];
    let helpersBlock = '';

    if (lang === 'javascript') {
      executionParts.push(
        `const operations = JSON.parse(lines[0]);`,
        `const args = JSON.parse(lines[1]);`,
        `let obj = null;`,
        `const results = [];`,
        `for (let i = 0; i < operations.length; i++) {`,
        `    const op = operations[i];`,
        `    const arg = args[i];`,
        `    if (i === 0) {`,
        `        obj = new ${className}(...arg);`,
        `        results.push(null);`,
        `    } else {`,
        `        switch(op) {`
      );
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const argMappings = m.parameters.map((p, idx) => `arg[${idx}]`).join(', ');
        executionParts.push(
          `            case "${m.name}": {`,
          m.returnType && m.returnType !== 'void'
            ? `                const res = obj.${m.name}(${argMappings});\n                results.push(res !== undefined ? res : null);`
            : `                obj.${m.name}(${argMappings});\n                results.push(null);`,
          `                break;`,
          `            }`
        );
      });
      executionParts.push(
        `            default: results.push(null);`,
        `        }`,
        `    }`,
        `}`
      );
      printParts.push(`console.log(JSON.stringify(results));`);

    } else if (lang === 'python') {
      executionParts.push(
        `import json`,
        `operations = json.loads(lines[0])`,
        `args = json.loads(lines[1])`,
        `obj = None`,
        `results = []`,
        `for i in range(len(operations)):`,
        `    op = operations[i]`,
        `    arg = args[i]`,
        `    if i == 0:`,
        `        obj = ${className}(*arg)`,
        `        results.append(None)`,
        `    else:`
      );
      let isFirst = true;
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const cond = isFirst ? 'if' : 'elif';
        isFirst = false;
        const argMappings = m.parameters.map((p, idx) => {
          if (p.type === 'INT') return `int(arg[${idx}])`;
          if (p.type === 'FLOAT') return `float(arg[${idx}])`;
          if (p.type === 'BOOLEAN') return `str(arg[${idx}]).lower() in ('true', '1')`;
          return `arg[${idx}]`;
        }).join(', ');

        executionParts.push(
          `        ${cond} op == "${m.name}":`,
          m.returnType && m.returnType !== 'void'
            ? `            res = obj.${m.name}(${argMappings})\n            results.append(res)`
            : `            obj.${m.name}(${argMappings})\n            results.append(None)`
        );
      });
      executionParts.push(
        `        else:`,
        `            results.append(None)`
      );
      printParts.push(`print(json.dumps(results, separators=(',', ':')))`);

    } else if (lang === 'go') {
      helpersBlock = `
func mustInt(s string) int {
    v, _ := strconv.Atoi(s)
    return v
}
func mustFloat(s string) float64 {
    v, _ := strconv.ParseFloat(s, 64)
    return v
}
`;
      executionParts.push(
        `var line0, line1 string;`,
        `if scanner.Scan() { line0 = scanner.Text() }`,
        `if scanner.Scan() { line1 = scanner.Text() }`,
        `operations := parseVectorString(line0)`,
        `args := parseMatrixString(line1)`,
        `var obj *${className}`,
        `var results []string`,
        `for i, op := range operations {`,
        `    arg := args[i]`,
        `    if i == 0 {`
      );
      const ctor = methods.find(m => m.name === 'Constructor');
      const ctorArgs = ctor ? ctor.parameters.map((p, idx) => {
        if (p.type === 'INT') return `mustInt(arg[${idx}])`;
        if (p.type === 'FLOAT') return `mustFloat(arg[${idx}])`;
        return `arg[${idx}]`;
      }).join(', ') : '';

      executionParts.push(
        `        obj = Constructor(${ctorArgs})`,
        `        results = append(results, "null")`,
        `    } else {`,
        `        switch op {`
      );
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const goMethodName = m.name.charAt(0).toUpperCase() + m.name.slice(1);
        const argMappings = m.parameters.map((p, idx) => {
          if (p.type === 'INT') return `mustInt(arg[${idx}])`;
          if (p.type === 'FLOAT') return `mustFloat(arg[${idx}])`;
          return `arg[${idx}]`;
        }).join(', ');

        executionParts.push(`        case "${m.name}":`);
        if (m.returnType && m.returnType !== 'void') {
          executionParts.push(`            res := obj.${goMethodName}(${argMappings})`);
          if (m.returnType === 'INT') {
            executionParts.push(`            results = append(results, strconv.Itoa(res))`);
          } else if (m.returnType === 'BOOLEAN') {
            executionParts.push(`            results = append(results, strconv.FormatBool(res))`);
          } else {
            executionParts.push(`            results = append(results, fmt.Sprintf("%v", res))`);
          }
        } else {
          executionParts.push(
            `            obj.${goMethodName}(${argMappings})`,
            `            results = append(results, "null")`
          );
        }
      });
      executionParts.push(
        `        default:`,
        `            results = append(results, "null")`,
        `        }`,
        `    }`,
        `}`
      );
      printParts = [
        `fmt.Print("[")`,
        `for idx, val := range results {`,
        `    if idx > 0 { fmt.Print(",") }`,
        `    if val == "null" || val == "true" || val == "false" {`,
        `        fmt.Print(val)`,
        `    } else {`,
        `        if _, err := strconv.Atoi(val); err == nil {`,
        `            fmt.Print(val)`,
        `        } else {`,
        `            fmt.Printf("%q", val)`,
        `        }`,
        `    }`,
        `}`,
        `fmt.Println("]")`
      ];

    } else if (lang === 'cpp') {
      helpersBlock = `
vector<vector<string>> parseMatrixString(string str) {
    vector<vector<string>> res;
    if (str.empty()) return res;
    if (str.front() == '[') str = str.substr(1);
    if (str.back() == ']') str.pop_back();
    size_t i = 0;
    while (i < str.length()) {
        while (i < str.length() && str[i] != '[') i++;
        if (i >= str.length()) break;
        size_t start = i + 1;
        while (i < str.length() && str[i] != ']') i++;
        size_t end = i;
        string sub = str.substr(start, end - start);
        vector<string> argList;
        stringstream ss(sub);
        string token;
        while (getline(ss, token, ',')) {
            while (!token.empty() && (isspace(token.front()) || token.front() == '"')) token.erase(token.begin());
            while (!token.empty() && (isspace(token.back()) || token.back() == '"')) token.pop_back();
            argList.push_back(token);
        }
        res.push_back(argList);
        i = end + 1;
    }
    return res;
}
`;
      executionParts.push(
        `string line0, line1;`,
        `getline(cin, line0);`,
        `getline(cin, line1);`,
        `vector<string> operations = parseVectorString(line0);`,
        `vector<vector<string>> args = parseMatrixString(line1);`,
        `${className}* obj = nullptr;`,
        `vector<string> results;`,
        `for (size_t i = 0; i < operations.size(); i++) {`,
        `    string op = operations[i];`,
        `    vector<string> arg = args[i];`,
        `    if (i == 0) {`
      );
      const ctor = methods.find(m => m.name === 'Constructor');
      const ctorArgs = ctor ? ctor.parameters.map((p, idx) => {
        if (p.type === 'INT') return `stoi(arg[${idx}])`;
        if (p.type === 'FLOAT') return `stod(arg[${idx}])`;
        return `arg[${idx}]`;
      }).join(', ') : '';

      executionParts.push(
        `        obj = new ${className}(${ctorArgs});`,
        `        results.push_back("null");`,
        `    } else {`
      );
      let isFirst = true;
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const cond = isFirst ? 'if' : 'else if';
        isFirst = false;
        const argMappings = m.parameters.map((p, idx) => {
          if (p.type === 'INT') return `stoi(arg[${idx}])`;
          if (p.type === 'FLOAT') return `stod(arg[${idx}])`;
          return `arg[${idx}]`;
        }).join(', ');

        executionParts.push(
          `        ${cond} (op == "${m.name}") {`,
          m.returnType && m.returnType !== 'void'
            ? (m.returnType === 'BOOLEAN'
              ? `            auto res = obj->${m.name}(${argMappings});\n            results.push_back(res ? "true" : "false");`
              : `            auto res = obj->${m.name}(${argMappings});\n            results.push_back(to_string(res));`)
            : `            obj->${m.name}(${argMappings});\n            results.push_back("null");`,
          `        }`
        );
      });
      executionParts.push(
        `        else { results.push_back("null"); }`,
        `    }`,
        `}`
      );
      printParts = [
        `cout << "[";`,
        `for (size_t idx = 0; idx < results.size(); idx++) {`,
        `    if (idx > 0) cout << ",";`,
        `    cout << results[idx];`,
        `}`,
        `cout << "]" << endl;`,
        `delete obj;`
      ];

    } else if (lang === 'c') {
      const cPrefix = className.charAt(0).toLowerCase() + className.slice(1);
      helpersBlock = `
void parseOpsC(char* str, char*** ops, int* len) {
    int cap = 16;
    *ops = malloc(sizeof(char*) * cap);
    int count = 0;
    char* p = str;
    while (*p) {
        if (*p == '"') {
            char* start = p + 1;
            char* end = strchr(start, '"');
            if (end) {
                int l = end - start;
                char* val = malloc(l + 1);
                strncpy(val, start, l);
                val[l] = '\\0';
                if (count >= cap) {
                    cap *= 2;
                    *ops = realloc(*ops, sizeof(char*) * cap);
                }
                (*ops)[count++] = val;
                p = end + 1;
                continue;
            }
        }
        p++;
    }
    *len = count;
}
void parseArgsC(char* str, char**** args, int** cols, int* len) {
    int cap = 16;
    *args = malloc(sizeof(char**) * cap);
    *cols = malloc(sizeof(int) * cap);
    int count = 0;
    char* p = str;
    if (*p == '[') p++;
    while (*p) {
        while (*p && *p != '[') {
            if (*p == ']') break;
            p++;
        }
        if (*p == ']' || !*p) break;
        p++; 
        char* start = p;
        char* end = strchr(start, ']');
        if (!end) break;
        int l = end - start;
        char* sub = malloc(l + 1);
        strncpy(sub, start, l);
        sub[l] = '\\0';
        
        int sub_cap = 4;
        char** sub_args = malloc(sizeof(char*) * sub_cap);
        int sub_count = 0;
        char* tok = strtok(sub, ",");
        while (tok) {
            while (*tok && (isspace(*tok) || *tok == '"')) tok++;
            int tok_l = strlen(tok);
            while (tok_l > 0 && (isspace(tok[tok_l - 1]) || tok[tok_l - 1] == '"')) {
                tok[tok_l - 1] = '\\0';
                tok_l--;
            }
            if (sub_count >= sub_cap) {
                sub_cap *= 2;
                sub_args = realloc(sub_args, sizeof(char*) * sub_cap);
            }
            sub_args[sub_count++] = strdup(tok);
            tok = strtok(NULL, ",");
        }
        free(sub);
        if (count >= cap) {
            cap *= 2;
            *args = realloc(*args, sizeof(char**) * cap);
            *cols = realloc(*cols, sizeof(int) * cap);
        }
        (*args)[count] = sub_args;
        (*cols)[count] = sub_count;
        count++;
        p = end + 1;
    }
    *len = count;
}
`;
      executionParts.push(
        `static char line0[1048576];`,
        `static char line1[1048576];`,
        `if (fgets(line0, sizeof(line0), stdin)) {}`,
        `if (fgets(line1, sizeof(line1), stdin)) {}`,
        `char** operations = NULL;`,
        `int operations_len = 0;`,
        `parseOpsC(line0, &operations, &operations_len);`,
        `char*** args = NULL;`,
        `int* args_cols = NULL;`,
        `int args_len = 0;`,
        `parseArgsC(line1, &args, &args_cols, &args_len);`,
        `void* obj = NULL;`,
        `char** results = malloc(sizeof(char*) * operations_len);`
      );
      const ctor = methods.find(m => m.name === 'Constructor');
      const ctorArgs = ctor ? ctor.parameters.map((p, idx) => {
        if (p.type === 'INT') return `atoi(args[0][${idx}])`;
        if (p.type === 'FLOAT') return `atof(args[0][${idx}])`;
        return `args[0][${idx}]`;
      }).join(', ') : '';

      executionParts.push(
        `for (int i = 0; i < operations_len; i++) {`,
        `    char* op = operations[i];`,
        `    if (i == 0) {`,
        `        obj = ${cPrefix}Create(${ctorArgs});`,
        `        results[0] = strdup("null");`,
        `    } else {`
      );
      let isFirst = true;
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const cond = isFirst ? 'if' : 'else if';
        isFirst = false;
        const cMethodName = cPrefix + m.name.charAt(0).toUpperCase() + m.name.slice(1);
        const argMappings = ['obj', ...m.parameters.map((p, idx) => {
          if (p.type === 'INT') return `atoi(args[i][${idx}])`;
          if (p.type === 'FLOAT') return `atof(args[i][${idx}])`;
          return `args[i][${idx}]`;
        })].join(', ');

        // MED-2 Fix: was hardcoding `int res` + %d for ALL return types.
        // Now generates type-correct C serialization per return type.
        let returnCode = `            ${cMethodName}(${argMappings});\n            results[i] = strdup("null");`;
        if (m.returnType && m.returnType !== 'void') {
          const rt = (m.returnType || '').toUpperCase();
          if (rt === 'BOOLEAN') {
            returnCode = `            int res = ${cMethodName}(${argMappings});\n            results[i] = strdup(res ? "true" : "false");`;
          } else if (rt === 'FLOAT' || rt === 'DOUBLE') {
            returnCode = `            double res = ${cMethodName}(${argMappings});\n            char buf[64];\n            sprintf(buf, "%.6g", res);\n            results[i] = strdup(buf);`;
          } else if (rt === 'STRING') {
            returnCode = `            char* res = ${cMethodName}(${argMappings});\n            results[i] = res ? strdup(res) : strdup("null");`;
          } else {
            // INT and any unknown numeric type
            returnCode = `            int res = ${cMethodName}(${argMappings});\n            char buf[32];\n            sprintf(buf, "%d", res);\n            results[i] = strdup(buf);`;
          }
        }

        executionParts.push(
          `        ${cond} (strcmp(op, "${m.name}") == 0) {`,
          returnCode,
          `        }`
        );
      });

      executionParts.push(
        `        else { results[i] = strdup("null"); }`,
        `    }`,
        `}`
      );
      printParts = [
        `printf("[");`,
        `for (int i = 0; i < operations_len; i++) {`,
        `    if (i > 0) printf(",");`,
        `    printf("%s", results[i]);`,
        `    free(results[i]);`,
        `}`,
        `printf("]\\n");`,
        `free(results);`,
        `if (obj) { ${cPrefix}Free(obj); }`
      ];

    } else if (lang === 'java') {
      helpersBlock = `
class Helpers {
    public static String[] parseOpsJava(String str) {
        if (str == null) return new String[0];
        str = str.replace("[", "").replace("]", "").replace("\\"", "");
        if (str.isEmpty()) return new String[0];
        String[] tokens = str.split(",");
        for (int i = 0; i < tokens.length; i++) {
            tokens[i] = tokens[i].trim();
        }
        return tokens;
    }
    public static List<List<String>> parseArgsJava(String str) {
        List<List<String>> res = new ArrayList<>();
        if (str == null) return res;
        str = str.trim();
        if (str.startsWith("[")) str = str.substring(1);
        if (str.endsWith("]")) str = str.substring(0, str.length() - 1);
        int i = 0;
        while (i < str.length()) {
            while (i < str.length() && str.charAt(i) != '[') i++;
            if (i >= str.length()) break;
            int start = i + 1;
            while (i < str.length() && str.charAt(i) != ']') i++;
            int end = i;
            String sub = str.substring(start, end).trim();
            List<String> argList = new ArrayList<>();
            if (!sub.isEmpty()) {
                for (String tok : sub.split(",")) {
                    argList.add(tok.trim().replace("\\"", ""));
                }
            }
            res.add(argList);
            i = end + 1;
        }
        return res;
    }
}
`;
      executionParts.push(
        `String line0 = reader.readLine();`,
        `String line1 = reader.readLine();`,
        `String[] operations = Helpers.parseOpsJava(line0);`,
        `List<List<String>> arguments = Helpers.parseArgsJava(line1);`,
        `${className} obj = null;`,
        `List<String> results = new ArrayList<>();`,
        `for (int i = 0; i < operations.length; i++) {`,
        `    String op = operations[i];`,
        `    List<String> arg = arguments.get(i);`,
        `    if (i == 0) {`
      );
      const ctor = methods.find(m => m.name === 'Constructor');
      const ctorArgs = ctor ? ctor.parameters.map((p, idx) => {
        if (p.type === 'INT') return `Integer.parseInt(arg.get(${idx}))`;
        if (p.type === 'FLOAT') return `Double.parseDouble(arg.get(${idx}))`;
        return `arg.get(${idx})`;
      }).join(', ') : '';

      executionParts.push(
        `        obj = new ${className}(${ctorArgs});`,
        `        results.add("null");`,
        `    } else {`
      );
      let isFirst = true;
      methods.forEach(m => {
        if (m.name === 'Constructor') return;
        const cond = isFirst ? 'if' : 'else if';
        isFirst = false;
        const argMappings = m.parameters.map((p, idx) => {
          if (p.type === 'INT') return `Integer.parseInt(arg.get(${idx}))`;
          if (p.type === 'FLOAT') return `Double.parseDouble(arg.get(${idx}))`;
          return `arg.get(${idx})`;
        }).join(', ');

        executionParts.push(
          `        ${cond} (op.equals("${m.name}")) {`,
          m.returnType && m.returnType !== 'void'
            ? `            Object res = obj.${m.name}(${argMappings});\n            results.add(res == null ? "null" : res.toString());`
            : `            obj.${m.name}(${argMappings});\n            results.add("null");`,
          `        }`
        );
      });
      executionParts.push(
        `        else { results.add("null"); }`,
        `    }`,
        `}`
      );
      printParts = [
        `StringBuilder sb = new StringBuilder("[");`,
        `for (int idx = 0; idx < results.size(); idx++) {`,
        `    if (idx > 0) sb.append(",");`,
        `    sb.append(results.get(idx));`,
        `}`,
        `sb.append("]");`,
        `System.out.println(sb.toString());`
      ];
    }

    return {
      executionParts,
      printParts,
      cleanupParts,
      helpersBlock
    };
  }
}

module.exports = new AssemblyEngine();
