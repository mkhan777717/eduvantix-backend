/**
 * Configuration map for supported languages in the Online Judge.
 * Defines compilation commands, runtime commands, source filenames, and Docker images.
 */
const LANGUAGE_CONFIG = {
  cpp: {
    image: 'gcc:latest',
    runImage: 'debian:slim',
    compileCmd: (srcPath, outPath) => `g++ -O2 -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.cpp',
    needsCompile: true,
  },
  java: {
    image: 'eclipse-temurin:17-jdk-alpine',
    compileCmd: (srcPath) => `javac ${srcPath}`,
    runCmd: () => `java -cp /sandbox Solution`,
    sourceFile: 'Solution.java',
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
    runImage: 'alpine:latest',
    compileCmd: (srcPath, outPath) => `go build -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.go',
    needsCompile: true,
  },
  // ─── New Languages ───────────────────────────────────────────────────────────
  typescript: {
    image: 'node:18-slim',
    compileCmd: (srcPath, outPath) => `npx ts-node ${srcPath}`,
    runCmd: (srcPath) => `node ${srcPath.replace('.ts', '.js')}`,
    sourceFile: 'main.ts',
    needsCompile: false, // ts-node runs directly
    localRunCmd: 'ts-node', // used for local fallback
  },
  c: {
    image: 'gcc:latest',
    runImage: 'debian:slim',
    compileCmd: (srcPath, outPath) => `gcc -O2 -o ${outPath} ${srcPath} -lm`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.c',
    needsCompile: true,
  },
  csharp: {
    image: 'mcr.microsoft.com/dotnet/sdk:7.0',
    compileCmd: (srcPath) => `dotnet-script ${srcPath}`,
    runCmd: (srcPath) => `dotnet-script ${srcPath}`,
    sourceFile: 'main.cs',
    needsCompile: false, // run via dotnet-script
    localRunCmd: 'dotnet-script',
  },
  kotlin: {
    image: 'zenika/kotlin:latest',
    compileCmd: (srcPath, outPath) => `kotlinc ${srcPath} -include-runtime -d ${outPath}.jar`,
    runCmd: (outPath) => `java -jar ${outPath}.jar`,
    sourceFile: 'main.kt',
    needsCompile: true,
    jarOutput: true,
  },
  swift: {
    image: 'swift:5.8',
    compileCmd: null,
    runCmd: (srcPath) => `swift ${srcPath}`,
    sourceFile: 'main.swift',
    needsCompile: false,
    localRunCmd: 'swift',
  },
  rust: {
    image: 'rust:1.70-slim',
    runImage: 'debian:slim',
    compileCmd: (srcPath, outPath) => `rustc -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => outPath,
    sourceFile: 'main.rs',
    needsCompile: true,
  },
  ruby: {
    image: 'ruby:3.2-slim',
    compileCmd: null,
    runCmd: (srcPath) => `ruby ${srcPath}`,
    sourceFile: 'main.rb',
    needsCompile: false,
    localRunCmd: 'ruby',
  },
  php: {
    image: 'php:8.2-cli',
    compileCmd: null,
    runCmd: (srcPath) => `php ${srcPath}`,
    sourceFile: 'main.php',
    needsCompile: false,
    localRunCmd: 'php',
  },
  dart: {
    image: 'dart:stable',
    compileCmd: null,
    runCmd: (srcPath) => `dart ${srcPath}`,
    sourceFile: 'main.dart',
    needsCompile: false,
    localRunCmd: 'dart',
  },
  scala: {
    image: 'hseeberger/scala-sbt:11.0.14.1_1.6.2_2.13.8',
    compileCmd: (srcPath, outPath) => `scalac -d ${outPath} ${srcPath}`,
    runCmd: (outPath) => `scala -cp ${outPath} Solution`,
    sourceFile: 'main.scala',
    needsCompile: true,
  },
  elixir: {
    image: 'elixir:1.15-slim',
    compileCmd: null,
    runCmd: (srcPath) => `elixir ${srcPath}`,
    sourceFile: 'main.ex',
    needsCompile: false,
    localRunCmd: 'elixir',
  },
  erlang: {
    image: 'erlang:26-slim',
    compileCmd: (srcPath, outPath) => `erlc -o ${outPath} ${srcPath}`,
    runCmd: (outPath) => `erl -noshell -pa ${outPath} -s main main -s init stop`,
    sourceFile: 'main.erl',
    needsCompile: true,
  },
  racket: {
    image: 'racket/racket:8.9',
    compileCmd: null,
    runCmd: (srcPath) => `racket ${srcPath}`,
    sourceFile: 'main.rkt',
    needsCompile: false,
    localRunCmd: 'racket',
  },
};

module.exports = {
  LANGUAGE_CONFIG,
};
