/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function copyFileSyncSafe(src, dest) {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(`[icpay-widget] Copied ${src} -> ${dest}`);
  } catch (e) {
    console.error(`[icpay-widget] Failed to copy ${src} -> ${dest}`, e);
  }
}

try {
  const projectRoot = __dirname ? path.join(__dirname, '..') : process.cwd();
  const srcUmd = path.join(projectRoot, 'src', 'index.umd.js');
  const destUmd = path.join(projectRoot, 'dist', 'wc', 'index.umd.js');

  if (!fs.existsSync(srcUmd)) {
    console.warn(`[icpay-widget] No local WC UMD found at ${srcUmd}; skipping copy.`);
    process.exit(0);
  }
  copyFileSyncSafe(srcUmd, destUmd);
} catch (e) {
  console.error('[icpay-widget] copy-wc-umd failed:', e);
  process.exit(0);
}


