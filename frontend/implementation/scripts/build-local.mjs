// Build untuk dicoba di laptop: game statis (out/) di :3000, backend FastAPI di :8000.
// Pakai: npm run build:local  (nilai yang sudah ada di environment tetap menang).
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NEXT_PUBLIC_PREDICTION_MODE: process.env.NEXT_PUBLIC_PREDICTION_MODE ?? "partner",
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000",
  NEXT_PUBLIC_DEV_TOOLS: process.env.NEXT_PUBLIC_DEV_TOOLS ?? "1",
};

const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", env, shell: true });
process.exit(result.status ?? 1);
