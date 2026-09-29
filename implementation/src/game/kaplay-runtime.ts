import type { KAPLAYCtx, KAPLAYOpt } from "kaplay";
import type { LevelContext, ObjectBehavior } from "../domain/types";
import { planSpawn } from "./behavior-spawner";

let kaplayInitialized = false;
let kaplayInstance: ReturnType<typeof import("kaplay").default> | null = null;

export type GameOutcome = "success" | "fail";

export interface KaplayGameHandle {
  destroy(): void;
}

export interface KaplayGameOptions {
  canvas: HTMLCanvasElement;
  level: LevelContext;
  behavior: ObjectBehavior;
  finalLabel: string;
  onOutcome(outcome: GameOutcome): void;
}

const WALK_SPEED = 120;

export async function createKaplayGame(options: KaplayGameOptions): Promise<KaplayGameHandle> {
  const kaplayModule = (await import("kaplay")).default;

  console.error("[KAPLAY] Creating game with behavior:", options.behavior, "label:", options.finalLabel);

  if (kaplayInitialized && kaplayInstance) {
    console.error("[KAPLAY] Destroying previous instance");
    try { kaplayInstance.quit(); } catch {}
    kaplayInitialized = false;
    kaplayInstance = null;
  }

  const kaplay = kaplayModule;
  console.error("[KAPLAY] Creating game with behavior:", options.behavior, "label:", options.finalLabel);

  const k = kaplay({
    global: false,
    canvas: options.canvas,
    width: 800,
    height: 380,
    background: [253, 250, 243],
    crisp: true,
    debug: false,
  } as KAPLAYOpt);

  kaplayInitialized = true;

  const { level, behavior } = options;
  const scene = level.scene;
  const groundY = 380 - 60;
  const plan = planSpawn(behavior, options.finalLabel, scene, 380);

  const segments = [
    { start: 0, end: scene.gapStartX },
    { start: scene.gapStartX + scene.gapWidth, end: Math.max(scene.goalX + 90, scene.gapStartX + scene.gapWidth + 220) },
  ];
  if (plan.kind !== "hazard") {
    segments.splice(1, 0, { start: scene.gapStartX, end: scene.gapStartX + scene.gapWidth });
  }

  const { addGround, addGoalZone, addSpawnObject, addPlayer } = await import("./entities/level-props");
  addGround(k, segments, groundY);
  addGoalZone(k, scene.goalX, groundY);
  addSpawnObject(k, plan, scene.gapStartX, groundY);
  const player = addPlayer(k, 40, groundY, "player");

  let settled = false;
  const report = (outcome: GameOutcome) => { if (settled) return; settled = true; options.onOutcome(outcome); };

  player.onUpdate(() => {
    if (settled) return;
    player.vel.x = WALK_SPEED;
    const fell = player.pos.y > 380 + 80;
    if (fell) { report("fail"); return; }
    const goalHit = (player as unknown as { isOverlapping: (o: string) => boolean }).isOverlapping("goal");
    if (goalHit) { report("success"); return; }
    const hazardHit = (player as unknown as { isOverlapping: (o: string) => boolean }).isOverlapping("hazard-zone");
    if (hazardHit) { report("fail"); }
  });

  return {
    destroy() { try { kaplayInstance?.quit(); } catch {} finally { kaplayInitialized = false; kaplayInstance = null; } }
  };
}