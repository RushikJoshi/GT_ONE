const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js', 'utf8');

let braces = 0;
let parens = 0;
let inString = false;
let quoteChar = '';
let inComment = false;
let inBlockComment = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i+1];

    if (inComment) {
        if (char === '\n') inComment = false;
        continue;
    }
    if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
            inBlockComment = false;
            i++;
        }
        continue;
    }
    if (inString) {
        if (char === quoteChar && content[i-1] !== '\\') inString = false;
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
    if (char === '(') parens++;
    if (char === ')') parens--;
}

console.log('Braces balance:', braces);
console.log('Parens balance:', parens);
