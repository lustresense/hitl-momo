import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(projectRoot, 'public', 'ort');

fs.mkdirSync(targetDir, { recursive: true });

if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  let count = 0;
  for (const file of files) {
    if (file === 'ort.min.js' || file.startsWith('ort-wasm') || file.includes('wasm')) {
      if (file.endsWith('.wasm') || file.endsWith('.mjs') || file.endsWith('.js')) {
        fs.copyFileSync(path.join(distDir, file), path.join(targetDir, file));
        count++;
      }
    }
  }
  console.log(`[copy-ort-wasm] Copied ${count} ORT WASM files to ${targetDir}`);
} else {
  console.warn(`[copy-ort-wasm] onnxruntime-web dist directory not found at ${distDir}`);
}
