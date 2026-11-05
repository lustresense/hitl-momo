const fs = require('fs');
const runPath = './implementation/e2e/run.mjs';
let code = fs.readFileSync(runPath, 'utf8');

// Ensure screenshots directory exists
code = code.replace(
  'import { spawn } from "child_process";',
  'import { spawn } from "child_process";\nimport fs from "fs";\nif (!fs.existsSync("./e2e/screenshots")) fs.mkdirSync("./e2e/screenshots");'
);

// Add screenshot after solid consequence overlay
code = code.replace(
  /check\("06 Accept → Solid success consequence.*?\);/,
  '$&\n  await page.screenshot({ path: "./e2e/screenshots/01-consequence-solid-success.png" });'
);

// Add screenshot for fallback/hazard consequence overlay
// We need to find where t2 is checked
code = code.replace(
  /const t2 = await page\.locator\("\.overlay-title"\)\.textContent\(\);/,
  '$&\n  await page.screenshot({ path: "./e2e/screenshots/02-consequence-fallback-hazard.png" });'
);

// Add screenshot for redraw/danger recovery
code = code.replace(
  /const t3 = await page\.locator\("\.overlay-title"\)\.textContent\(\);/,
  '$&\n  await page.screenshot({ path: "./e2e/screenshots/03-consequence-danger.png" });'
);

// completion screenshot
code = code.replace(
  /check\("16 stage-1 complete reached", true\);/,
  '$&\n  await page.screenshot({ path: "./e2e/screenshots/04-completion.png" });'
);

// mobile screenshot
code = code.replace(
  /check\("17 responsive smoke at 390px.*?\);/,
  '$&\n  await page.screenshot({ path: "./e2e/screenshots/05-mobile-gameplay.png" });'
);

fs.writeFileSync(runPath, code);
