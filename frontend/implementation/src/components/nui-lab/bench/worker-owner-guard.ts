/**
 * R22 Single-Owner Track Continuity & Bystander Guard (`worker-owner-guard.ts`).
 *
 * Root-cause fix (R22 W04–W06, §C03, §B06):
 *  - In `@mediapipe/tasks-vision@0.10.14`, calling `landmarker.setOptions({ numHands })` rebuilds the
 *    WASM calculator graph (`setGraph`), destroying VIDEO tracking state and forcing cold palm detection.
 *  - R22 default policy (`policy: "fixed-2"`, zero runtime `setOptions` calls) keeps MediaPipe `numHands=2`
 *    fixed for the entire session and enforces single-owner lock, automatic reacquire (zero manual relock
 *    button), bystander rejection, and 2-hand crossing/ambiguity hold (`ambiguousHold: true`) purely in JS!
 *  - Policy `"fixed-1"` keeps `numHands=1` fixed (0 runtime `setOptions` calls) for A/B ablation.
 *  - Policy `"legacy-dynamic"` preserves the R20-FIX P0.3 dynamic 1<->2 state machine ONLY when explicitly
 *    selected (or when constructed with the legacy R20 config signature without `policy`/`fixedNumHands`),
 *    keeping full backwards compatibility with `tests/nui-lab/bench-worker-and-lowlight.test.ts` and A/B benchmarks.
 */

export interface WorkerPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface WorkerHandedness {
  categoryName: string;
  score: number;
}

export type OwnerGuardPolicy = "fixed-2" | "fixed-1" | "legacy-dynamic";

export type OwnerFailClosedReason =
  | "owner-jump-reject"
  | "owner-size-reject"
  | "owner-ambiguous-hold"
  | null;

/** Contract K2 ownerTrack telemetry emitted on every worker frame. */
export interface WorkerOwnerTrack {
  locked: boolean;
  trackId: number;
  handCount: number;
  ambiguousHold: boolean;
  rejectReason: string | null;
}

export interface OwnerGuardConfig {
  enabled: boolean;
  /**
   * R22 numHands policy:
   *  - `"fixed-2"`: zero runtime `setOptions`; MediaPipe always runs `numHands=2` with JS owner-track lock + bystander guard.
   *  - `"fixed-1"`: zero runtime `setOptions`; MediaPipe always runs `numHands=1` with JS continuity guard.
   *  - `"legacy-dynamic"`: R20 B3v2 dynamic 1<->2 toggling (legacy tests & A/B comparator only).
   */
  policy?: OwnerGuardPolicy;
  /** Explicit fixed `numHands` override (implies zero runtime `setOptions`). */
  fixedNumHands?: 1 | 2;
  maxJump?: number;
  maxSizeRatio?: number;
  minHandSize?: number;
  lockConfirmFrames?: number;
  auditIntervalFrames?: number;
  bystanderCooldownFrames?: number;
  ambiguityGap?: number;
  crossingDistance?: number;
  handednessFlipConfidence?: number;
  /** Empty camera duration (ms) before releasing an active owner lock for clean auto-reacquire (default 300 ms). */
  emptyResetMs?: number;
  /** Duration (ms) of continuous unmatched hand before releasing a stale abandoned lock (default Infinity — never auto-releases while another hand remains visible to prevent bystander takeover). */
  unmatchedResetMs?: number;
}

export interface OwnerGuardStepResult {
  landmarks: WorkerPoint3[][];
  handedness: WorkerHandedness[];
  nextNumHands: 1 | 2;
  failClosedReason: OwnerFailClosedReason;
  triggeredHandednessProbe: boolean;
  ownerTrack: WorkerOwnerTrack;
}

export interface OwnerGuardTelemetry {
  activeNumHands: 1 | 2;
  policy: OwnerGuardPolicy;
  bystanderAudits: number;
  bystanderDetections: number;
  ownerJumpRejects: number;
  ownerSizeRejects: number;
  ambiguousHolds: number;
  handednessProbes: number;
  bystanderCooldown: number;
  trackId: number;
  locked: boolean;
}

interface OwnerTrackSnapshot {
  x: number;
  y: number;
  size: number;
  handedness: string | null;
  handednessScore: number;
  lastSeenMs: number;
}

interface PendingCandidate {
  x: number;
  y: number;
  size: number;
  frames: number;
  lastSeenMs: number;
}

function handBBox(lm: WorkerPoint3[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

function handBoxSize(lm: WorkerPoint3[]): number {
  const b = handBBox(lm);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

function bboxOverlapMinArea(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
): number {
  const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  const areaA = Math.max(1e-6, (a.maxX - a.minX) * (a.maxY - a.minY));
  const areaB = Math.max(1e-6, (b.maxX - b.minX) * (b.maxY - b.minY));
  return inter / Math.min(areaA, areaB);
}

function sizeRatio(a: number, b: number): number {
  return Math.max(a, b) / Math.max(1e-6, Math.min(a, b));
}

function isValidHand(lm: WorkerPoint3[]): boolean {
  if (!lm || lm.length < 21 || !lm[0]) return false;
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  return true;
}

export class WorkerOwnerGuard {
  private readonly enabled: boolean;
  readonly policy: OwnerGuardPolicy;
  private readonly maxJump: number;
  private readonly maxSizeRatio: number;
  private readonly minHandSize: number;
  private readonly lockConfirmFrames: number;
  private readonly auditIntervalFrames: number;
  private readonly bystanderCooldownFrames: number;
  private readonly ambiguityGap: number;
  private readonly crossingDistance: number;
  private readonly handednessFlipConfidence: number;
  private readonly emptyResetMs: number;
  private readonly unmatchedResetMs: number;

  activeNumHands: 1 | 2 = 2;
  private lockedStreak = 0;
  private framesSinceAudit = 0;
  private bystanderCooldown = 0;
  private lastOwner: OwnerTrackSnapshot | null = null;
  private pendingCandidate: PendingCandidate | null = null;
  private emptySinceMs: number | null = null;
  private emptyFrames = 0;
  private unmatchedSinceMs: number | null = null;
  private trackId = 0;
  private syntheticClockMs = 0;
  private lastOwnerTrack: WorkerOwnerTrack = {
    locked: false,
    trackId: 0,
    handCount: 0,
    ambiguousHold: false,
    rejectReason: "no-hand",
  };

  bystanderAudits = 0;
  bystanderDetections = 0;
  ownerJumpRejects = 0;
  ownerSizeRejects = 0;
  ambiguousHolds = 0;
  handednessProbes = 0;

  constructor(cfg: OwnerGuardConfig) {
    this.enabled = cfg.enabled;
    if (cfg.policy) {
      this.policy = cfg.policy;
    } else if (cfg.fixedNumHands === 1) {
      this.policy = "fixed-1";
    } else if (cfg.fixedNumHands === 2) {
      this.policy = "fixed-2";
    } else {
      // Legacy R20 constructor signature (no policy/fixedNumHands) preserved for existing unit tests.
      this.policy = "legacy-dynamic";
    }

    this.maxJump = cfg.maxJump ?? 0.18;
    this.maxSizeRatio = cfg.maxSizeRatio ?? 1.6;
    this.minHandSize = cfg.minHandSize ?? 0.08;
    this.lockConfirmFrames = cfg.lockConfirmFrames ?? (this.policy === "legacy-dynamic" ? 4 : 2);
    this.auditIntervalFrames = cfg.auditIntervalFrames ?? 15;
    this.bystanderCooldownFrames = cfg.bystanderCooldownFrames ?? 30;
    this.ambiguityGap = cfg.ambiguityGap ?? 0.045;
    this.crossingDistance = cfg.crossingDistance ?? 0.08;
    this.handednessFlipConfidence = cfg.handednessFlipConfidence ?? 0.78;
    this.emptyResetMs = cfg.emptyResetMs ?? 300;
    this.unmatchedResetMs = cfg.unmatchedResetMs ?? Number.POSITIVE_INFINITY;
    this.activeNumHands = this.policy === "fixed-1" ? 1 : 2;
  }

  reset(initialNumHands?: 1 | 2): void {
    if (this.policy === "fixed-1") {
      this.activeNumHands = 1;
    } else if (this.policy === "fixed-2") {
      this.activeNumHands = 2;
    } else {
      this.activeNumHands = this.enabled ? 2 : (initialNumHands ?? 2);
    }
    this.lockedStreak = 0;
    this.framesSinceAudit = 0;
    this.bystanderCooldown = 0;
    this.lastOwner = null;
    this.pendingCandidate = null;
    this.emptySinceMs = null;
    this.emptyFrames = 0;
    this.unmatchedSinceMs = null;
    this.trackId = 0;
    this.syntheticClockMs = 0;
    this.lastOwnerTrack = {
      locked: false,
      trackId: 0,
      handCount: 0,
      ambiguousHold: false,
      rejectReason: "no-hand",
    };
  }

  /**
   * Called right BEFORE `detectForVideo`.
   * Under R22 fixed policies (`fixed-2` / `fixed-1`), ALWAYS returns the constant `activeNumHands`
   * so `landmarker.setOptions({ numHands })` is NEVER invoked during tracking.
   */
  beforeDetect(): 1 | 2 {
    if (!this.enabled || this.policy !== "legacy-dynamic") {
      return this.activeNumHands;
    }
    if (this.activeNumHands === 1 && this.framesSinceAudit >= this.auditIntervalFrames) {
      this.activeNumHands = 2;
      this.framesSinceAudit = 0;
      this.bystanderAudits++;
    }
    return this.activeNumHands;
  }

  /**
   * Called right AFTER `detectForVideo`; enforces single-owner continuity, automatic reacquire,
   * and bystander / crossing fail-closed holds.
   */
  afterDetect(
    lms: WorkerPoint3[][],
    hds: WorkerHandedness[],
    timestampMs?: number,
  ): OwnerGuardStepResult {
    const nowMs =
      typeof timestampMs === "number" && Number.isFinite(timestampMs)
        ? timestampMs
        : (this.syntheticClockMs += 66.67);

    if (!this.enabled) {
      const ownerTrack: WorkerOwnerTrack = {
        locked: lms.length === 1,
        trackId: lms.length > 0 ? Math.max(1, this.trackId) : 0,
        handCount: lms.length,
        ambiguousHold: false,
        rejectReason: lms.length === 0 ? "no-hand" : null,
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: this.activeNumHands,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    if (this.policy === "legacy-dynamic") {
      return this.afterDetectLegacyDynamic(lms, hds, nowMs);
    }

    return this.afterDetectFixedR22(lms, hds, nowMs);
  }

  /**
   * R22 Zero-`setOptions` single-owner track continuity & 2-hand bystander guard.
   * Keeps `activeNumHands` strictly fixed (`2` or `1`) and runs all ownership & safety logic in JS.
   */
  private afterDetectFixedR22(
    lms: WorkerPoint3[][],
    hds: WorkerHandedness[],
    nowMs: number,
  ): OwnerGuardStepResult {
    const fixedHands: 1 | 2 = this.policy === "fixed-1" ? 1 : 2;
    this.activeNumHands = fixedHands;

    // Extract valid hands above minimum hand size
    const valid = lms
      .map((lm, i) => {
        if (!isValidHand(lm)) return null;
        const wrist = lm[0]!;
        const bbox = handBBox(lm);
        const size = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
        if (size < this.minHandSize) return null;
        return { i, lm, hd: hds[i] ?? { categoryName: "Unknown", score: 0 }, wrist, bbox, size };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const rawHandCount = valid.length;

    // Case 1: No valid hands detected
    if (rawHandCount === 0) {
      this.pendingCandidate = null;
      this.unmatchedSinceMs = null;

      if (!this.lastOwner) {
        this.emptySinceMs = null;
        this.emptyFrames = 0;
        const ownerTrack: WorkerOwnerTrack = {
          locked: false,
          trackId: this.trackId,
          handCount: 0,
          ambiguousHold: false,
          rejectReason: "no-hand",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: fixedHands,
          failClosedReason: null,
          triggeredHandednessProbe: false,
          ownerTrack,
        };
      }

      if (this.emptySinceMs === null) {
        this.emptySinceMs = nowMs;
      }
      this.emptyFrames++;
      const emptyElapsed = nowMs - this.emptySinceMs;

      if (emptyElapsed >= this.emptyResetMs) {
        this.lastOwner = null;
        this.lockedStreak = 0;
        this.emptySinceMs = null;
        this.emptyFrames = 0;
        const ownerTrack: WorkerOwnerTrack = {
          locked: false,
          trackId: this.trackId,
          handCount: 0,
          ambiguousHold: false,
          rejectReason: "empty-reset",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: fixedHands,
          failClosedReason: null,
          triggeredHandednessProbe: false,
          ownerTrack,
        };
      }

      // Short detector blink (< emptyResetMs): preserve owner trackId for seamless recovery!
      const ownerTrack: WorkerOwnerTrack = {
        locked: true,
        trackId: this.trackId,
        handCount: 0,
        ambiguousHold: false,
        rejectReason: "temporary-loss",
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: [],
        handedness: [],
        nextNumHands: fixedHands,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // If camera had been empty long enough before this hand appeared, release stale owner lock first
    if (this.lastOwner && this.emptySinceMs !== null && nowMs - this.emptySinceMs >= this.emptyResetMs) {
      this.lastOwner = null;
      this.lockedStreak = 0;
    }
    this.emptySinceMs = null;
    this.emptyFrames = 0;

    // Case 2: No active owner lock -> automatic single-hand acquisition (NO manual relock button!)
    if (!this.lastOwner) {
      return this.tryAutoAcquireFixed(valid, fixedHands, nowMs);
    }

    // Case 3: Active owner is locked
    if (rawHandCount >= 2) {
      this.bystanderDetections++;
      this.bystanderCooldown = this.bystanderCooldownFrames;
    } else if (this.bystanderCooldown > 0) {
      this.bystanderCooldown--;
    }

    // Match each visible hand against the locked owner's spatial & scale envelope
    const evaluated = valid.map((h) => {
      const dist = Math.hypot(h.wrist.x - this.lastOwner!.x, h.wrist.y - this.lastOwner!.y);
      const sRatio = sizeRatio(h.size, this.lastOwner!.size);
      const compatible = dist <= this.maxJump && sRatio <= this.maxSizeRatio;
      return { ...h, dist, sRatio, compatible };
    });

    const matches = evaluated
      .filter((h) => h.compatible)
      .sort((a, b) => a.dist - b.dist);

    // Subcase 3a: 2+ hands visible and they cross / overlap ambiguously -> FAIL-CLOSED HOLD!
    if (rawHandCount >= 2 && matches.length >= 2) {
      const gap = matches[1]!.dist - matches[0]!.dist;
      const interHandDist = Math.hypot(
        matches[1]!.wrist.x - matches[0]!.wrist.x,
        matches[1]!.wrist.y - matches[0]!.wrist.y,
      );
      const overlap = bboxOverlapMinArea(matches[0]!.bbox, matches[1]!.bbox);
      if (gap < this.ambiguityGap || interHandDist < this.crossingDistance || overlap >= 0.15) {
        this.ambiguousHolds++;
        this.unmatchedSinceMs = null;
        const ownerTrack: WorkerOwnerTrack = {
          locked: true,
          trackId: this.trackId,
          handCount: rawHandCount,
          ambiguousHold: true,
          rejectReason: "crossing",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: fixedHands,
          failClosedReason: "owner-ambiguous-hold",
          triggeredHandednessProbe: false,
          ownerTrack,
        };
      }
    }

    // Subcase 3b: Single match (or unambiguously separated primary hand amidst bystander)
    if (matches.length >= 1) {
      const best = matches[0]!;
      // Also check if another visible hand is physically overlapping/crossing the owner's hand box
      if (rawHandCount >= 2) {
        const overlappingOther = evaluated.some(
          (h) =>
            h.i !== best.i &&
            (Math.hypot(h.wrist.x - best.wrist.x, h.wrist.y - best.wrist.y) < this.crossingDistance ||
              bboxOverlapMinArea(h.bbox, best.bbox) >= 0.15),
        );
        if (overlappingOther) {
          this.ambiguousHolds++;
          const ownerTrack: WorkerOwnerTrack = {
            locked: true,
            trackId: this.trackId,
            handCount: rawHandCount,
            ambiguousHold: true,
            rejectReason: "crossing",
          };
          this.lastOwnerTrack = ownerTrack;
          return {
            landmarks: [],
            handedness: [],
            nextNumHands: fixedHands,
            failClosedReason: "owner-ambiguous-hold",
            triggeredHandednessProbe: false,
            ownerTrack,
          };
        }
      }

      const hdName =
        best.hd.score >= this.handednessFlipConfidence ? best.hd.categoryName : null;

      // High-confidence handedness flip during active bystander cooldown (e.g. opposite-hand bystander
      // occluding owner while crossing!) -> FAIL-CLOSED HOLD without overwriting owner track!
      if (
        hdName &&
        this.lastOwner.handedness &&
        hdName !== this.lastOwner.handedness &&
        (this.bystanderCooldown > 0 || best.hd.score >= 0.9)
      ) {
        this.handednessProbes++;
        this.ambiguousHolds++;
        this.bystanderCooldown = Math.max(this.bystanderCooldown, 10);
        const ownerTrack: WorkerOwnerTrack = {
          locked: true,
          trackId: this.trackId,
          handCount: rawHandCount,
          ambiguousHold: true,
          rejectReason: "crossing-handedness-flip",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: fixedHands,
          failClosedReason: "owner-ambiguous-hold",
          triggeredHandednessProbe: true,
          ownerTrack,
        };
      }

      this.unmatchedSinceMs = null;
      this.lastOwner = {
        x: best.wrist.x,
        y: best.wrist.y,
        size: best.size,
        handedness: hdName ?? this.lastOwner.handedness,
        handednessScore: best.hd.score,
        lastSeenMs: nowMs,
      };
      this.lockedStreak++;

      // Place locked owner FIRST at index 0, followed by any clearly separated secondary/bystander hands
      const orderedLms: WorkerPoint3[][] = [best.lm];
      const orderedHds: WorkerHandedness[] = [best.hd];
      for (const other of evaluated) {
        if (other.i !== best.i) {
          orderedLms.push(other.lm);
          orderedHds.push(other.hd);
        }
      }

      const ownerTrack: WorkerOwnerTrack = {
        locked: true,
        trackId: this.trackId,
        handCount: rawHandCount,
        ambiguousHold: false,
        rejectReason: null,
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: orderedLms,
        handedness: orderedHds,
        nextNumHands: fixedHands,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // Subcase 3c: Zero visible hands match the locked owner -> fail-closed bystander/jump/size reject!
    const closest = [...evaluated].sort((a, b) => a.dist - b.dist)[0]!;
    const isJump = closest.dist > this.maxJump;
    const isSize = closest.sRatio > this.maxSizeRatio;

    if (this.unmatchedSinceMs === null) {
      this.unmatchedSinceMs = nowMs;
    }

    // Only allow unmatched-hand release if explicitly configured with a finite unmatchedResetMs AND
    // no bystander was recently detected (preventing bystander takeover during temporary owner occlusion!).
    const ownerAbsentMs = nowMs - this.lastOwner.lastSeenMs;
    const unmatchedElapsedMs = nowMs - this.unmatchedSinceMs;
    if (
      rawHandCount === 1 &&
      this.bystanderCooldown === 0 &&
      Number.isFinite(this.unmatchedResetMs) &&
      ownerAbsentMs >= this.unmatchedResetMs &&
      unmatchedElapsedMs >= this.unmatchedResetMs
    ) {
      this.lastOwner = null;
      this.lockedStreak = 0;
      this.unmatchedSinceMs = null;
      return this.tryAutoAcquireFixed(valid, fixedHands, nowMs);
    }

    let failClosedReason: OwnerFailClosedReason;
    let rejectReason: string;
    if (isJump) {
      this.ownerJumpRejects++;
      failClosedReason = "owner-jump-reject";
      rejectReason = "owner-jump-reject";
    } else if (isSize) {
      this.ownerSizeRejects++;
      failClosedReason = "owner-size-reject";
      rejectReason = "owner-size-reject";
    } else {
      this.ambiguousHolds++;
      failClosedReason = "owner-ambiguous-hold";
      rejectReason = "unmatched-hand";
    }

    const ownerTrack: WorkerOwnerTrack = {
      locked: true,
      trackId: this.trackId,
      handCount: rawHandCount,
      ambiguousHold: true,
      rejectReason,
    };
    this.lastOwnerTrack = ownerTrack;
    return {
      landmarks: [],
      handedness: [],
      nextNumHands: fixedHands,
      failClosedReason,
      triggeredHandednessProbe: false,
      ownerTrack,
    };
  }

  private tryAutoAcquireFixed(
    valid: Array<{
      i: number;
      lm: WorkerPoint3[];
      hd: WorkerHandedness;
      wrist: WorkerPoint3;
      size: number;
    }>,
    fixedHands: 1 | 2,
    nowMs: number,
  ): OwnerGuardStepResult {
    // Multiple hands visible while unlocked -> fail-closed ambiguous hold (never guess owner!)
    if (valid.length >= 2) {
      this.bystanderDetections++;
      this.ambiguousHolds++;
      this.pendingCandidate = null;
      const ownerTrack: WorkerOwnerTrack = {
        locked: false,
        trackId: this.trackId,
        handCount: valid.length,
        ambiguousHold: true,
        rejectReason: "multiple-hands",
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: [],
        handedness: [],
        nextNumHands: fixedHands,
        failClosedReason: "owner-ambiguous-hold",
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    const one = valid[0]!;
    const hdName =
      one.hd.score >= this.handednessFlipConfidence ? one.hd.categoryName : null;

    const consistentWithPending =
      this.pendingCandidate !== null &&
      nowMs - this.pendingCandidate.lastSeenMs <= 500 &&
      Math.hypot(one.wrist.x - this.pendingCandidate.x, one.wrist.y - this.pendingCandidate.y) <= this.maxJump &&
      sizeRatio(one.size, this.pendingCandidate.size) <= this.maxSizeRatio;

    const nextFrames = consistentWithPending ? this.pendingCandidate!.frames + 1 : 1;
    this.pendingCandidate = {
      x: one.wrist.x,
      y: one.wrist.y,
      size: one.size,
      frames: nextFrames,
      lastSeenMs: nowMs,
    };

    if (nextFrames < this.lockConfirmFrames) {
      const ownerTrack: WorkerOwnerTrack = {
        locked: false,
        trackId: this.trackId,
        handCount: 1,
        ambiguousHold: false,
        rejectReason: "validating",
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: [one.lm],
        handedness: [one.hd],
        nextNumHands: fixedHands,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // Stable single hand confirmed -> lock automatically!
    this.trackId++;
    this.pendingCandidate = null;
    this.lockedStreak = nextFrames;
    this.lastOwner = {
      x: one.wrist.x,
      y: one.wrist.y,
      size: one.size,
      handedness: hdName,
      handednessScore: one.hd.score,
      lastSeenMs: nowMs,
    };

    const ownerTrack: WorkerOwnerTrack = {
      locked: true,
      trackId: this.trackId,
      handCount: 1,
      ambiguousHold: false,
      rejectReason: null,
    };
    this.lastOwnerTrack = ownerTrack;
    return {
      landmarks: [one.lm],
      handedness: [one.hd],
      nextNumHands: fixedHands,
      failClosedReason: null,
      triggeredHandednessProbe: false,
      ownerTrack,
    };
  }

  /** Legacy R20 B3v2 dynamic 1<->2 logic (kept ONLY for backwards-compat unit tests & A/B ablation). */
  private afterDetectLegacyDynamic(
    lms: WorkerPoint3[][],
    hds: WorkerHandedness[],
    nowMs: number,
  ): OwnerGuardStepResult {
    // 0 hands: immediately revert to 2-hand acquisition mode
    if (lms.length === 0) {
      this.lockedStreak = 0;
      this.framesSinceAudit = 0;
      this.lastOwner = null;
      this.activeNumHands = 2;
      const ownerTrack: WorkerOwnerTrack = {
        locked: false,
        trackId: this.trackId,
        handCount: 0,
        ambiguousHold: false,
        rejectReason: "no-hand",
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // 2+ hands detected: bystander present! Keep numHands=2 during cooldown and forward ALL hands
    if (lms.length >= 2) {
      this.bystanderDetections++;
      this.bystanderCooldown = this.bystanderCooldownFrames;
      this.framesSinceAudit = 0;
      this.activeNumHands = 2;

      let ambiguousHold = false;
      if (this.lastOwner) {
        const matches = lms
          .map((lm, i) => {
            const w = lm[0];
            if (!w) return null;
            const sz = handBoxSize(lm);
            const d = Math.hypot(w.x - this.lastOwner!.x, w.y - this.lastOwner!.y);
            if (d <= this.maxJump && sizeRatio(sz, this.lastOwner!.size) <= this.maxSizeRatio) {
              return { i, x: w.x, y: w.y, sz, d };
            }
            return null;
          })
          .filter((x): x is { i: number; x: number; y: number; sz: number; d: number } => x !== null)
          .sort((a, b) => a.d - b.d);

        if (matches.length === 1 || (matches.length >= 2 && matches[1]!.d - matches[0]!.d >= this.ambiguityGap)) {
          const best = matches[0]!;
          const hd = hds[best.i];
          this.lastOwner = {
            x: best.x,
            y: best.y,
            size: best.sz,
            handedness: hd && hd.score >= this.handednessFlipConfidence ? hd.categoryName : this.lastOwner.handedness,
            handednessScore: hd ? hd.score : 0,
            lastSeenMs: nowMs,
          };
        } else {
          ambiguousHold = true;
          this.ambiguousHolds++;
        }
      } else {
        ambiguousHold = true;
      }

      const ownerTrack: WorkerOwnerTrack = {
        locked: this.lastOwner !== null,
        trackId: this.trackId,
        handCount: lms.length,
        ambiguousHold,
        rejectReason: ambiguousHold ? "crossing" : null,
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // Single hand visible
    const hand = lms[0]!;
    const wrist = hand[0];
    if (!wrist) {
      this.activeNumHands = 2;
      this.lastOwner = null;
      this.lockedStreak = 0;
      const ownerTrack: WorkerOwnerTrack = {
        locked: false,
        trackId: this.trackId,
        handCount: 0,
        ambiguousHold: false,
        rejectReason: "no-hand",
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: [],
        handedness: [],
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }
    const sz = handBoxSize(hand);
    const hd = hds[0];
    const hdName = hd && hd.score >= this.handednessFlipConfidence ? hd.categoryName : null;

    if (this.activeNumHands === 1 && this.lastOwner) {
      const jumpDist = Math.hypot(wrist.x - this.lastOwner.x, wrist.y - this.lastOwner.y);
      const sRatio = sizeRatio(sz, this.lastOwner.size);

      if (jumpDist > this.maxJump) {
        this.ownerJumpRejects++;
        this.lockedStreak = 0;
        this.framesSinceAudit = 0;
        this.lastOwner = null;
        this.activeNumHands = 2;
        const ownerTrack: WorkerOwnerTrack = {
          locked: false,
          trackId: this.trackId,
          handCount: 1,
          ambiguousHold: true,
          rejectReason: "owner-jump-reject",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: 2,
          failClosedReason: "owner-jump-reject",
          triggeredHandednessProbe: false,
          ownerTrack,
        };
      }

      if (sRatio > this.maxSizeRatio) {
        this.ownerSizeRejects++;
        this.lockedStreak = 0;
        this.framesSinceAudit = 0;
        this.lastOwner = null;
        this.activeNumHands = 2;
        const ownerTrack: WorkerOwnerTrack = {
          locked: false,
          trackId: this.trackId,
          handCount: 1,
          ambiguousHold: true,
          rejectReason: "owner-size-reject",
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: 2,
          failClosedReason: "owner-size-reject",
          triggeredHandednessProbe: false,
          ownerTrack,
        };
      }

      if (hdName && this.lastOwner.handedness && hdName !== this.lastOwner.handedness) {
        this.handednessProbes++;
        this.bystanderCooldown = Math.max(this.bystanderCooldown, 6);
        this.framesSinceAudit = 0;
        this.activeNumHands = 2;
        this.lastOwner = {
          x: wrist.x,
          y: wrist.y,
          size: sz,
          handedness: hdName,
          handednessScore: hd?.score ?? 0,
          lastSeenMs: nowMs,
        };
        const ownerTrack: WorkerOwnerTrack = {
          locked: true,
          trackId: this.trackId,
          handCount: 1,
          ambiguousHold: false,
          rejectReason: null,
        };
        this.lastOwnerTrack = ownerTrack;
        return {
          landmarks: lms,
          handedness: hds,
          nextNumHands: 2,
          failClosedReason: null,
          triggeredHandednessProbe: true,
          ownerTrack,
        };
      }

      this.lastOwner = {
        x: wrist.x,
        y: wrist.y,
        size: sz,
        handedness: hdName ?? this.lastOwner.handedness,
        handednessScore: hd?.score ?? this.lastOwner.handednessScore,
        lastSeenMs: nowMs,
      };
      this.lockedStreak++;
      this.framesSinceAudit++;
      const ownerTrack: WorkerOwnerTrack = {
        locked: true,
        trackId: this.trackId,
        handCount: 1,
        ambiguousHold: false,
        rejectReason: null,
      };
      this.lastOwnerTrack = ownerTrack;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 1,
        failClosedReason: null,
        triggeredHandednessProbe: false,
        ownerTrack,
      };
    }

    // Currently in numHands=2 with 1 visible hand
    if (!this.lastOwner) {
      this.trackId++;
    }
    this.lastOwner = {
      x: wrist.x,
      y: wrist.y,
      size: sz,
      handedness: hdName ?? this.lastOwner?.handedness ?? null,
      handednessScore: hd?.score ?? 0,
      lastSeenMs: nowMs,
    };
    this.lockedStreak++;
    if (this.bystanderCooldown > 0) {
      this.bystanderCooldown--;
    }

    if (
      this.lockedStreak >= this.lockConfirmFrames &&
      this.bystanderCooldown === 0 &&
      sz >= this.minHandSize
    ) {
      this.activeNumHands = 1;
      this.framesSinceAudit = 0;
    } else {
      this.activeNumHands = 2;
    }

    const ownerTrack: WorkerOwnerTrack = {
      locked: this.lockedStreak >= this.lockConfirmFrames,
      trackId: this.trackId,
      handCount: 1,
      ambiguousHold: false,
      rejectReason: null,
    };
    this.lastOwnerTrack = ownerTrack;
    return {
      landmarks: lms,
      handedness: hds,
      nextNumHands: this.activeNumHands,
      failClosedReason: null,
      triggeredHandednessProbe: false,
      ownerTrack,
    };
  }

  ownerTrack(): WorkerOwnerTrack {
    return { ...this.lastOwnerTrack };
  }

  telemetry(): OwnerGuardTelemetry {
    return {
      activeNumHands: this.activeNumHands,
      policy: this.policy,
      bystanderAudits: this.bystanderAudits,
      bystanderDetections: this.bystanderDetections,
      ownerJumpRejects: this.ownerJumpRejects,
      ownerSizeRejects: this.ownerSizeRejects,
      ambiguousHolds: this.ambiguousHolds,
      handednessProbes: this.handednessProbes,
      bystanderCooldown: this.bystanderCooldown,
      trackId: this.trackId,
      locked: this.lastOwnerTrack.locked,
    };
  }
}

/** Convenience factory for R22 zero-`setOptions` single-owner tracking (default `fixed-2`). */
export function createR22OwnerGuard(
  cfg: Omit<OwnerGuardConfig, "enabled"> & { enabled?: boolean } = {},
): WorkerOwnerGuard {
  return new WorkerOwnerGuard({
    enabled: cfg.enabled ?? true,
    policy: cfg.policy ?? (cfg.fixedNumHands === 1 ? "fixed-1" : "fixed-2"),
    ...cfg,
  });
}
