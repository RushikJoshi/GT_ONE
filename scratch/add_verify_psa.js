const fs = require('fs');
const filePath = 'c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

const search = 'async function verifySuperAdminPassword(password) {';
let index = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(search)) {
        // Find closing brace
        for (let j = i; j < i + 20; j++) {
            if (lines[j].trim() === '}') {
                index = j;
                break;
            }
        }
        break;
    }
}

if (index !== -1) {
    const codeToAdd = `
exports.verifyPsaPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const isOk = await verifySuperAdminPassword(password);
    if (!isOk) {
      return res.status(401).json({ success: false, message: 'invalid_password' });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'server_error' });
  }
};
`;
    lines.splice(index + 1, 0, codeToAdd);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('Added verifyPsaPassword.');
} else {
    console.log('Could not find verifySuperAdminPassword closing brace.');
}
