#!/usr/bin/env node
/**
 * FX12 TS Parity Runner (`r23/scripts/detector/ts_parity.mjs`).
 *
 * Uses original functions from `bench/monui7-yolo.ts`:
 * - letterboxRgbaToNchw
 * - parseYoloOutput (handles end-to-end [1, N, 6] or raw head [1, 5, N] with NMS)
 * - unletterboxBox
 * Runs onnxruntime-web (Wasm/Node engine) on raw RGBA files from $DATA_ROOT/qa/fx12/.
 * Outputs ts_preds.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import ort from '/home/deano/monui7-local/work/frontend/implementation/node_modules/onnxruntime-web/dist/ort.node.min.js';
import {
  letterboxRgbaToNchw,
  parseYoloOutput,
} from '/home/deano/monui7-local/work/frontend/implementation/src/components/nui-lab/bench/monui7-yolo.ts';

async function main() {
  const args = process.argv.slice(2);
  const modelPath = args[0] || '/home/deano/monui7-local/data/release/monui7-hand-yolo26n-320.onnx';
  const qaDir = args[1] || '/home/deano/monui7-local/data/qa/fx12';
  const outJson = args[2] || path.join(qaDir, 'ts_preds.json');

  if (!fs.existsSync(modelPath)) {
    console.error(`Model file not found: ${modelPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(qaDir)) {
    console.error(`QA directory not found: ${qaDir}`);
    process.exit(1);
  }

  console.log(`Loading ONNX model: ${modelPath}`);
  const modelBuffer = fs.readFileSync(modelPath);
  const session = await ort.InferenceSession.create(modelBuffer);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  console.log(`ONNX Session created. Input: ${inputName}, Output: ${outputName}`);

  // Find all .json files in qaDir (excluding py_preds.json and ts_preds.json)
  const metaFiles = fs.readdirSync(qaDir)
    .filter(f => f.endsWith('.json') && f !== 'py_preds.json' && f !== 'ts_preds.json');

  console.log(`Found ${metaFiles.length} image test cases in ${qaDir}`);

  const tsPreds = {};

  for (let i = 0; i < metaFiles.length; i++) {
    const jsonFile = metaFiles[i];
    const baseName = jsonFile.replace(/\.json$/, '');
    const metaPath = path.join(qaDir, jsonFile);
    const rgbaPath = path.join(qaDir, `${baseName}.rgba`);

    if (!fs.existsSync(rgbaPath)) {
      console.warn(`Missing RGBA file for ${baseName}`);
      continue;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const rgbaBuffer = fs.readFileSync(rgbaPath);

    // Letterbox RGBA to 320x320 NCHW Float32Array using real monui7-yolo function
    const { tensor, meta: lbMeta } = letterboxRgbaToNchw(rgbaBuffer, meta.width, meta.height, 320, 114);

    // Create ONNX Tensor [1, 3, 320, 320]
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, 320, 320]);

    // Run inference
    const outputMap = await session.run({ [inputName]: inputTensor });
    const outputTensor = outputMap[outputName];

    // Parse YOLO output using real monui7-yolo function (conf 0.35, NMS IoU 0.5)
    const detections = parseYoloOutput(outputTensor.data, outputTensor.dims, lbMeta, 0.35, 0.5);

    tsPreds[baseName] = detections.map(d => ({
      box: [d.box[0], d.box[1], d.box[2], d.box[3]],
      score: d.score,
      classId: d.classId,
    }));

    console.log(`[${i + 1}/${metaFiles.length}] ${baseName}: ${detections.length} detections`);
  }

  fs.writeFileSync(outJson, JSON.stringify(tsPreds, null, 2), 'utf-8');
  console.log(`\nTS predictions saved to ${outJson}`);
}

main().catch(err => {
  console.error('Fatal error running TS parity:', err);
  process.exit(1);
});
