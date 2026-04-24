const fs = require('fs');
const filePath = 'c:\\Users\\baldaniya nitesh\\Desktop\\GT_HRMS\\GT_HRMS\\server\\controllers\\auth.controller.js';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Remove the first 285 lines (the duplicate header/garbage)
const cleanLines = lines.slice(286);

// Now fix the corruption in cleanLines
// It's around line 546 in the original file, which is 546-286 = 260 in cleanLines
// But let's find it by content.

const corruptedStart = 'async function verifySuperAdminPassword(password) {';
const corruptedEnd = '  return false;'; // and the next line '}'

let startIdx = -1;
for (let i = 0; i < cleanLines.length; i++) {
    if (cleanLines[i].includes(corruptedStart)) {
        startIdx = i;
        break;
    }
}

if (startIdx !== -1) {
    // Find the end marker
    let endIdx = -1;
    for (let i = startIdx; i < startIdx + 50; i++) {
        if (cleanLines[i].includes('  return false;') && cleanLines[i+1]?.trim() === '}') {
            endIdx = i + 1;
            break;
        }
    }

    if (endIdx !== -1) {
        const correctSection = `async function verifySuperAdminPassword(password) {
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
        cleanLines.splice(startIdx, (endIdx - startIdx) + 1, correctSection);
        fs.writeFileSync(filePath, cleanLines.join('\n'));
        console.log('Fixed file.');
    } else {
        console.log('Could not find corrupted end.');
    }
} else {
    console.log('Could not find corrupted start.');
}
