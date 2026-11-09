// Builds the single-file character book: node tools/character-book/build.mjs
// Output: academic/progress-book/karakter/karakter-thinman-momo.html (no network needed; open with a double click).
import { build } from "../../implementation/node_modules/esbuild/lib/main.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const result = await build({
  entryPoints: [path.join(here, "entry.ts")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  legalComments: "none",
  nodePaths: [path.join(root, "implementation/node_modules")],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const tpl = fs.readFileSync(path.join(here, "template.html"), "utf8");
const today = new Date().toISOString().slice(0, 10);
const html = tpl.replace("/*__BUNDLE__*/", () => js).replace("__BUILD_DATE__", today);
const out = path.join(root, "academic/progress-book/karakter/karakter-thinman-momo.html");
fs.writeFileSync(out, html);
console.log("written", out, (html.length / 1024).toFixed(0) + " KB");
