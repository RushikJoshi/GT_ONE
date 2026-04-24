const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js', 'utf8');

let braces = 0;
let inString = false;
let quoteChar = '';
let inComment = false;
let inBlockComment = false;

const lines = content.split('\n');
let lastZeroLine = 0;

for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i+1];

        if (inComment) continue;
        if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (char === quoteChar && line[i-1] !== '\\') inString = false;
            continue;
        }

        if (char === '/' && nextChar === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            inString = true;
            quoteChar = char;
            continue;
        }

        if (char === '{') braces++;
        if (char === '}') braces--;
    }
    inComment = false;
    if (braces === 0) {
        lastZeroLine = lineNum + 1;
    }
}

console.log('Final braces balance:', braces);
console.log('Last line where balance was zero:', lastZeroLine);
