/**
 * Configuration map for supported languages in the Online Judge.
 * Defines compilation commands, runtime commands, source filenames, and Docker images.
 */
const LANGUAGE_CONFIG = {
  cpp: {
    image: 'gcc:latest',
    compileCmd: (srcPath, outPath) => `g++ -O2 -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.cpp',
    needsCompile: true,
  },
  java: {
    image: 'openjdk:17-slim', // Using openjdk slim for faster startup
    compileCmd: (srcPath) => `javac ${srcPath}`,
    runCmd: () => `java -cp /sandbox Main`,
    sourceFile: 'Main.java', // Must match the public class name 'Main'
    needsCompile: true,
  },
  python: {
    image: 'python:3.10-slim',
    compileCmd: null,
    runCmd: (srcPath) => `python3 ${srcPath}`,
    sourceFile: 'main.py',
    needsCompile: false,
  },
  javascript: {
    image: 'node:18-slim',
    compileCmd: null,
    runCmd: (srcPath) => `node ${srcPath}`,
    sourceFile: 'main.js',
    needsCompile: false,
  },
  go: {
    image: 'golang:1.20-alpine',
    compileCmd: (srcPath, outPath) => `go build -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.go',
    needsCompile: true,
  },
};

module.exports = {
  LANGUAGE_CONFIG,
};
