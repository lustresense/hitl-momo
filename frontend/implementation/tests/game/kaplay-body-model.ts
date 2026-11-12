/**
 * Headless fixed-step model of the integrated stage's body (tests only, never shipped).
 *
 * Step order is KAPLAY 3001's, checked against its sources (kaplay.ts fixedUpdateFrame + checkFrame,
 * make.ts fixedUpdate, body.ts fixedUpdate/jump/isGrounded, area.ts colliding cache) and the
 * scene's add order (world-setup.ts adds the player before IntegratedScene's onFixedUpdate object):
 *   1. player body.fixedUpdate: gravity, then move by velocity;
 *   2. IntegratedScene.fixedStep: horizontal move, then the jump, which sets the velocity that step 1 applies next;
 *   3. checkFrame: SAT in spatial-hash cell order, each hit pushes the body out along the minimum axis.
 * The SAT function and the vec2 it calls are read from the installed kaplay sourcemap, so the
 * collision maths is KAPLAY's own. No rendering, no browser: browser E2E stays the authority for feel.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { JumpAssist } from "../../src/game/jump-assist";
import { GRAVITY, JUMP_FORCE, PLAYER_HEIGHT, PLAYER_WIDTH } from "../../src/game/runtime/constants";
import { resolveHorizontalMovementIntent } from "../../src/game/runtime/movement";

/** KAPLAY fixed timestep (kaplay app.ts: fixedDt = 1 / 50). */
const FIXED_DT = 1 / 50;

export interface Box { x: number; y: number; w: number; h: number }
export interface Vec {
  x: number;
  y: number;
  sub(o: Vec): Vec;
  add(o: Vec): Vec;
  scale(n: number): Vec;
  dot(o: Vec): number;
  normal(): Vec;
  unit(): Vec;
  len(): number;
}
export interface Poly { pts: Vec[] }
interface SatResult { normal: Vec; distance: number }

/** Minimal vec2 with the methods KAPLAY's sat() calls. Same definitions as kaplay math.ts. */
function vec2(x: number, y: number = x): Vec {
  return {
    x,
    y,
    sub: (o) => vec2(x - o.x, y - o.y),
    add: (o) => vec2(x + o.x, y + o.y),
    scale: (n) => vec2(x * n, y * n),
    dot: (o) => x * o.x + y * o.y,
    normal: () => vec2(y, -x),
    len: () => Math.hypot(x, y),
    unit: () => {
      const len = Math.hypot(x, y);
      return len === 0 ? vec2(0) : vec2(x / len, y / len);
    },
  };
}

interface SourceMap { sources: string[]; sourcesContent: Array<string | null> }
const kaplayMap = JSON.parse(readFileSync("node_modules/kaplay/dist/kaplay.js.map", "utf8")) as SourceMap;

/** Source text of one top-level function, found by brace matching. */
function functionText(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`kaplay math source changed: "${header}" not found`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated function "${header}"`);
}

const mathIndex = kaplayMap.sources.findIndex((s) => s.endsWith("/math/math.ts"));
const mathSource = kaplayMap.sourcesContent[mathIndex];
if (!mathSource) throw new Error("kaplay sourcemap has no math/math.ts");
const satJs = ts.transpileModule(
  functionText(mathSource, "export function sat(").replace(/^export /, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const sat = new Function("vec2", `${satJs}\nreturn sat;`)(vec2) as (a: Poly, b: Poly) => SatResult | null;

export function rectPoly(x: number, y: number, w: number, h: number): Poly {
  return { pts: [vec2(x, y), vec2(x + w, y), vec2(x + w, y + h), vec2(x, y + h)] };
}
export function polyFrom(points: Array<readonly [number, number]>): Poly {
  return { pts: points.map(([x, y]) => vec2(x, y)) };
}

/** Penetration push-out distance between the player's box and a static shape (0 when apart or touching). */
export function playerPenetration(x: number, y: number, shape: Poly): number {
  const res = sat(rectPoly(x, y, PLAYER_WIDTH, PLAYER_HEIGHT), shape);
  return res ? Math.abs(res.distance) : 0;
}

/** Hash cells covered by a box, in checkFrame's order: x ascending, then y ascending (inclusive ends, as KAPLAY). */
const HASH_CELL = 64;
function cellsOf(x: number, y: number, w: number, h: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  const xmin = Math.floor(x / HASH_CELL), ymin = Math.floor(y / HASH_CELL);
  const xmax = Math.ceil((x + w) / HASH_CELL), ymax = Math.ceil((y + h) / HASH_CELL);
  for (let cx = xmin; cx <= xmax; cx++) for (let cy = ymin; cy <= ymax; cy++) cells.push([cx, cy]);
  return cells;
}

export interface Input { left: boolean; right: boolean; jump: boolean }

/**
 * The player body in physics pixels (top-left anchor, 24x40). Solids are static rect colliders.
 * Starts airborne; use `step` once per fixed step.
 */
export class StageBody {
  x: number;
  y: number;
  vy = 0;
  /** KAPLAY body.curPlatform: the solid the body landed on; cleared by a jump or after it falls off. */
  private curPlatform: number | null = null;
  /** KAPLAY willFall: the body has left curPlatform; the next fixed step drops it. */
  private willFall = false;
  /** Solids in contact at the end of the last checkFrame (KAPLAY area "colliding" cache). */
  private touching = new Set<number>();
  private readonly jumps = new JumpAssist();
  private readonly solids: Poly[];
  /** Spatial hash cells (KAPLAY DEF_HASH_GRID_SIZE) listing solids in insertion order, as checkFrame builds them. */
  private readonly grid = new Map<string, number[]>();

  constructor(start: { x: number; y: number }, solids: Box[]) {
    this.x = start.x;
    this.y = start.y;
    this.solids = solids.map((b) => rectPoly(b.x, b.y, b.w, b.h));
    solids.forEach((b, index) => {
      for (const [cx, cy] of cellsOf(b.x, b.y, b.w, b.h)) {
        const key = `${cx}:${cy}`;
        this.grid.set(key, [...(this.grid.get(key) ?? []), index]);
      }
    });
  }

  /** KAPLAY isGrounded(): true while curPlatform is set (it lags one step behind a fall-off). */
  get grounded(): boolean {
    return this.curPlatform !== null;
  }

  /**
   * One fixed step in KAPLAY's order. The order is the behaviour: a jump or a fall-off moves
   * the body one step later than a naive model would.
   * 1. The player's body.fixedUpdate (children run before the root's fixedUpdate event):
   *    drop curPlatform if willFall, apply gravity, move by the velocity.
   * 2. IntegratedScene.fixedStep, registered after the player: horizontal move, then the jump,
   *    which replaces the velocity and is applied by the next step's body.fixedUpdate.
   * 3. checkFrame: SAT against the solids in the body's hash cells, each hit pushing the body out.
   */
  step(input: Input): void {
    if (this.willFall) {
      this.curPlatform = null;
      this.willFall = false;
    }
    if (this.curPlatform !== null && !this.touching.has(this.curPlatform)) this.willFall = true;
    this.vy += GRAVITY * FIXED_DT;
    this.y += this.vy * FIXED_DT;

    this.x += resolveHorizontalMovementIntent(input, true, false) * FIXED_DT;
    if (this.jumps.step(this.grounded, input.jump)) {
      // player.jump(): replaces the velocity and forgets the platform.
      this.curPlatform = null;
      this.vy = -JUMP_FORCE;
    }
    this.resolve();
  }

  /**
   * checkFrame for the body: visit the spatial-hash cells it covers (x-major, then y), and SAT each
   * solid once in cell order. Each hit pushes the body out along the minimum axis, so the order
   * decides which of two touching colliders wins, exactly as in KAPLAY.
   */
  private resolve(): void {
    const touching = new Set<number>();
    const checked = new Set<number>();
    for (const [cx, cy] of cellsOf(this.x, this.y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
      for (const index of this.grid.get(`${cx}:${cy}`) ?? []) {
        if (checked.has(index)) continue;
        checked.add(index);
        const res = sat(rectPoly(this.x, this.y, PLAYER_WIDTH, PLAYER_HEIGHT), this.solids[index]!);
        // KAPLAY caches a touching pair too (sat returns a zero-distance result), so contact counts.
        if (!res) continue;
        touching.add(index);
        const d = res.normal.scale(res.distance);
        this.x += d.x;
        this.y += d.y;
        if (d.y < 0 && this.vy > 0) {
          // isBottom + isFalling: land, drop the fall speed and remember the platform.
          this.vy = 0;
          this.curPlatform = index;
          this.willFall = false;
        } else if (d.y > 0 && this.vy < 0) {
          // isTop + isJumping: headbutt.
          this.vy = 0;
        }
      }
    }
    this.touching = touching;
  }
}
