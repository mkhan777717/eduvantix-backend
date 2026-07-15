// --- IMPORTS ---
const fs = require('fs');

// --- RUNTIME ---


// --- HELPERS ---


// --- USER CODE ---

function twoSum(nums, target) {
    for(let i = 0; i < nums.length; i++) {
        for(let j = i + 1; j < nums.length; j++) {
            if(nums[i] + nums[j] === target) return [i, j];
        }
    }
    return [];
}

// --- MAIN ---
function main() {
    const fs = require('fs');
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    if (!rawInput) return;
    const lines = rawInput.split(/\r?\n/);
    try {
          if (lines.length > 0) {
        const nums = JSON.parse(lines[0].trim());
    }
        if (lines.length > 1) {
        const target = parseInt(lines[1].trim(), 10);
    }
        const result = twoSum(nums, target);
          console.log(JSON.stringify(result));
    } catch (e) {
          console.error(e);
          process.exit(1);
    }
}
main();
