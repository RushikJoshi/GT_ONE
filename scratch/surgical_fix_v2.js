const fs = require('fs');
const filePath = 'c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js';
let content = fs.readFileSync(filePath, 'utf8');

// The corrupted part starts with 'async function verifySuperAdminPassword(password) {' 
// and ends with 'return false;\n}'

const corruptedStart = 'async function verifySuperAdminPassword(password) {';
const corruptedEnd = '  return false;\n}';

const startIdx = content.indexOf(corruptedStart);
const endIdx = content.indexOf(corruptedEnd, startIdx) + corruptedEnd.length;

if (startIdx !== -1 && endIdx !== -1) {
    const correctCode = `async function verifySuperAdminPassword(password) {
  const config = getSuperAdminConfig();

  if (config.passwordHash) {
    return bcrypt.compare(String(password || ''), config.passwordHash);
  }

  if (config.password) {
    return config.password === String(password || '');
  }

  return false;
}

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
};`;

    const newContent = content.substring(0, startIdx) + correctCode + content.substring(endIdx);
    fs.writeFileSync(filePath, newContent);
    console.log('Fixed verifySuperAdminPassword and added verifyPsaPassword.');
} else {
    console.log('Could not find markers for replacement.', {startIdx, endIdx});
}
