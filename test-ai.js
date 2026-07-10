const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { generateQuestions } = require('./src/services/questionGenerationService');

async function run() {
  const text = "JavaScript is a single-threaded language. It uses an event loop. The event loop handles asynchronous callbacks by pushing them to the callback queue (or microtask queue) and running them when the call stack is empty. var is function-scoped and hoisted. let and const are block-scoped, hoisted but in temporal dead zone, and const cannot be reassigned.";
  try {
    const questions = await generateQuestions(text, 'JavaScript', 2);
    console.log(JSON.stringify(questions, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
