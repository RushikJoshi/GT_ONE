const fs = require('fs');
const filePath = 'c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// I need to be careful with line numbers as they shift.
// In the CURRENT state (after my failed edits):
// Line 504 is empty (from my first successful replace of line 505)
// Line 505-514 is the orphaned block.
// Line 700ish is the restored block.

// Let's find the orphaned block by content.
const startMarker = '  const adminAccount = await findAdminByEmail(email, allowedRoles);';
const endMarker = '    return { error: \'invalid_credentials\' };';

let foundIndex = -1;
for (let i = 0; i < 600; i++) { // Only check early in file
    if (lines[i]?.includes(startMarker)) {
        foundIndex = i;
        break;
    }
}

if (foundIndex !== -1) {
    console.log('Found orphaned block at line', foundIndex + 1);
    // Remove 9 lines (505 to 513 roughly)
    lines.splice(foundIndex, 9);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('Fixed file.');
} else {
    console.log('Could not find orphaned block.');
}
