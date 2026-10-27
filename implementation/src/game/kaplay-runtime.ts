import type { KAPLAYCtx, KAPLAYOpt } from "kaplay";
import type { LevelContext, ObjectBehavior } from "../domain/types";
import { planSpawn } from "./behavior-spawner";

let kaplayInitialized = false;
let kaplayInstance: ReturnType<typeof import("kaplay").default> | null = null;

export type GameOutcome = "success" | "fail";

export interface KaplayGameHandle {
  destroy(): void;
  /** External input setter for player control (NUI/keyboard). */
  setInput(input: { left: boolean; right: boolean; jump: boolean }): void;
}

export interface KaplayGameOptions {
  canvas: HTMLCanvasElement;
  level: LevelContext;
  behavior: ObjectBehavior;
  finalLabel: string;
  onOutcome(outcome: GameOutcome): void;
}

const WALK_SPEED = 200;
const JUMP_FORCE = -550;
const GRAVITY = 1600;

export async function createKaplayGame(options: KaplayGameOptions): Promise<KaplayGameHandle> {
  const kaplayModule = (await import("kaplay")).default;

  console.log("[KAPLAY] Creating game with behavior:", options.behavior, "label:", options.finalLabel);

  if (kaplayInitialized && kaplayInstance) {
    console.log("[KAPLAY] Destroying previous instance");
    try { kaplayInstance.quit(); } catch {}
    kaplayInitialized = false;
    kaplayInstance = null;
  }

  const kaplay = kaplayModule;
  console.log("[KAPLAY] Creating game with behavior:", options.behavior, "label:", options.finalLabel);

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

  // Player input state (set externally via setInput)
  let inputState = { left: false, right: false, jump: false };

  let settled = false;
  let timerId: NodeJS.Timeout | null = null;
  const report = (outcome: GameOutcome) => {
    if (settled) return;
    settled = true;
    if (timerId) clearTimeout(timerId);
    options.onOutcome(outcome);
  };
  timerId = setTimeout(() => {
    if (!settled) report(plan.kind === "hazard" ? "fail" : "success");
  }, 30000); // Longer timeout since player controls movement

  player.onCollide("goal", () => {
    report("success");
  });
  player.onCollide("hazard-zone", () => {
    report("fail");
  });

  player.onUpdate(() => {
    if (settled) return;

    // Horizontal movement from input
    let velX = 0;
    if (inputState.left) velX -= WALK_SPEED;
    if (inputState.right) velX += WALK_SPEED;
    player.vel.x = velX;

    // Jump from input
    if (inputState.jump && player.isGrounded()) {
      player.jump(JUMP_FORCE);
    }

    // Check goal reached
    if (player.pos.x >= scene.goalX && player.isGrounded()) {
      report("success");
      return;
    }
    // Check fall
    const fell = player.pos.y > 380 + 80;
    if (fell) {
      report("fail");
      return;
    }
  });

  return {
    destroy() {
      if (timerId) clearTimeout(timerId);
      try { kaplayInstance?.quit(); } catch {} finally { kaplayInitialized = false; kaplayInstance = null; }
    },
    setInput(input: { left: boolean; right: boolean; jump: boolean }) {
      inputState = input;
    },
  };
}