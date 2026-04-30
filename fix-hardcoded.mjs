import fs from 'fs';
import path from 'path';

const filesToPatch = [
  "server/server.js",
  "server/services/auth.service.js",
  "server/services/company.service.js",
  "server/services/email.service.js",
  "server/services/hrmsProvisioning.service.js",
  "server/services/otp.service.js",
  "server/services/signingKey.service.js",
  "server/middleware/ssoSession.middleware.js",
  "server/middleware/verifySSO.js",
  "server/constants/products.js",
  "client/src/lib/api.js",
  "client/src/App.jsx",
  "client/src/pages/Launcher.jsx",
  "client/src/pages/Login.jsx",
  "packages/gtone-product-connector/index.js",
  "packages/gtone-product-connector/README.md",
  "server/templates/product-connector/README.md",
  "server/templates/product-connector/gtOneProductConnector.example.js"
];

const basePath = "d:/GT_ONE/GT_ONE";

for (const relPath of filesToPatch) {
  const fullPath = path.join(basePath, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${fullPath}`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');

  // Emails
  content = content.replace(/admin@gitakshmi\.com/g, 'admin@example.com');
  content = content.replace(/no-reply@gitakshmi\.com/g, 'no-reply@example.com');
  
  // Domains
  content = content.replace(/https:\/\/gaccess\.gitakshmi\.com/g, 'http://localhost:5174');
  content = content.replace(/https:\/\/devgaccess\.gitakshmi\.com/g, 'http://localhost:5174');
  content = content.replace(/https:\/\/hrms\.dev\.gitakshmi\.com/g, 'http://localhost:5176');
  content = content.replace(/https:\/\/devprojects\.gitakshmi\.com/g, 'http://localhost:5173');
  content = content.replace(/\.gitakshmi\.com/g, '.example.com');
  
  // JWT Issuer
  content = content.replace(/gitakshmi-sso/g, 'gtone-sso');
  
  // OTP Secret
  content = content.replace(/gitakshmi-dev-otp-secret/g, 'default-dev-otp-secret');

  // Company Code comment
  content = content.replace(/"gitakshmi" -> "GIT001"/g, '"example" -> "EXA001"');

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Patched ${relPath}`);
}
