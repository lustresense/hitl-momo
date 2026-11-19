/**
 * Guarded Dynamic Owner-Lock state machine for the CPU Web Worker (R20-FIX P0.3).
 *
 * Addresses the audit finding on naive `numHands=1` locking:
 *  - Uses `numHands=2` during acquisition, loss recovery, and whenever a bystander was seen recently.
 *  - While locked on a lone owner hand (`numHands=1`), enforces:
 *      1. Tight spatial continuity (`MAX_JUMP = 0.18`, matching FullFrameHandLock)
 *      2. Hand-size ratio continuity (`MAX_SIZE_RATIO = 1.6`, catching closer/farther bystanders at close range)
 *      3. Handedness-flip verification probe (`Left <-> Right` with confidence >= 0.78 -> immediate `numHands=2` check)
 *      4. Periodic 2-hand bystander audit probe (every `auditIntervalFrames` locked frames, defaults to 15) so a
 *         second hand sneaking close to the owner cannot silently steal the lone `numHands=1` slot.
 *  - Whenever 2 hands are visible, enters `bystanderCooldown` (stays in `numHands=2`) and forwards ALL hands
 *    to main-thread `FullFrameHandLock` so its crossing/ambiguity (`AMBIGUITY_GAP = 0.045`) guard runs with full visibility.
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

export interface OwnerGuardConfig {
  enabled: boolean;
  maxJump?: number;
  maxSizeRatio?: number;
  minHandSize?: number;
  lockConfirmFrames?: number;
  auditIntervalFrames?: number;
  bystanderCooldownFrames?: number;
  ambiguityGap?: number;
  handednessFlipConfidence?: number;
}

export interface OwnerGuardStepResult {
  landmarks: WorkerPoint3[][];
  handedness: WorkerHandedness[];
  nextNumHands: 1 | 2;
  failClosedReason: "owner-jump-reject" | "owner-size-reject" | null;
  triggeredHandednessProbe: boolean;
}

export interface OwnerGuardTelemetry {
  activeNumHands: 1 | 2;
  bystanderAudits: number;
  bystanderDetections: number;
  ownerJumpRejects: number;
  ownerSizeRejects: number;
  handednessProbes: number;
  bystanderCooldown: number;
}

function handBoxSize(lm: WorkerPoint3[]): number {
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
  return Math.max(maxX - minX, maxY - minY);
}

function sizeRatio(a: number, b: number): number {
  return Math.max(a, b) / Math.max(1e-6, Math.min(a, b));
}

export class WorkerOwnerGuard {
  private readonly enabled: boolean;
  private readonly maxJump: number;
  private readonly maxSizeRatio: number;
  private readonly minHandSize: number;
  private readonly lockConfirmFrames: number;
  private readonly auditIntervalFrames: number;
  private readonly bystanderCooldownFrames: number;
  private readonly ambiguityGap: number;
  private readonly handednessFlipConfidence: number;

  activeNumHands: 1 | 2 = 2;
  private lockedStreak = 0;
  private framesSinceAudit = 0;
  private bystanderCooldown = 0;
  private lastOwner: {
    x: number;
    y: number;
    size: number;
    handedness: string | null;
    handednessScore: number;
  } | null = null;

  bystanderAudits = 0;
  bystanderDetections = 0;
  ownerJumpRejects = 0;
  ownerSizeRejects = 0;
  handednessProbes = 0;

  constructor(cfg: OwnerGuardConfig) {
    this.enabled = cfg.enabled;
    this.maxJump = cfg.maxJump ?? 0.18;
    this.maxSizeRatio = cfg.maxSizeRatio ?? 1.6;
    this.minHandSize = cfg.minHandSize ?? 0.08;
    this.lockConfirmFrames = cfg.lockConfirmFrames ?? 4;
    this.auditIntervalFrames = cfg.auditIntervalFrames ?? 15;
    this.bystanderCooldownFrames = cfg.bystanderCooldownFrames ?? 30;
    this.ambiguityGap = cfg.ambiguityGap ?? 0.045;
    this.handednessFlipConfidence = cfg.handednessFlipConfidence ?? 0.78;
    this.activeNumHands = 2;
  }

  reset(initialNumHands: 1 | 2 = 2): void {
    this.activeNumHands = this.enabled ? 2 : initialNumHands;
    this.lockedStreak = 0;
    this.framesSinceAudit = 0;
    this.bystanderCooldown = 0;
    this.lastOwner = null;
  }

  /** Called right BEFORE detectForVideo; returns desired numHands for this frame (may schedule periodic 2-hand audit). */
  beforeDetect(): 1 | 2 {
    if (!this.enabled) return this.activeNumHands;
    if (this.activeNumHands === 1 && this.framesSinceAudit >= this.auditIntervalFrames) {
      this.activeNumHands = 2;
      this.framesSinceAudit = 0;
      this.bystanderAudits++;
    }
    return this.activeNumHands;
  }

  /** Called right AFTER detectForVideo; enforces continuity/bystander guards and computes nextNumHands. */
  afterDetect(lms: WorkerPoint3[][], hds: WorkerHandedness[]): OwnerGuardStepResult {
    if (!this.enabled) {
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: this.activeNumHands,
        failClosedReason: null,
        triggeredHandednessProbe: false,
      };
    }

    // 0 hands: immediately revert to 2-hand acquisition mode
    if (lms.length === 0) {
      this.lockedStreak = 0;
      this.framesSinceAudit = 0;
      this.lastOwner = null;
      this.activeNumHands = 2;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
      };
    }

    // 2+ hands detected: bystander present! Keep numHands=2 during cooldown and forward ALL hands to FullFrameHandLock
    if (lms.length >= 2) {
      this.bystanderDetections++;
      this.bystanderCooldown = this.bystanderCooldownFrames;
      this.framesSinceAudit = 0;
      this.activeNumHands = 2;

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

        // Only update lastOwner when unambiguously separated from the second hand
        if (matches.length === 1 || (matches.length >= 2 && matches[1]!.d - matches[0]!.d >= this.ambiguityGap)) {
          const best = matches[0]!;
          const hd = hds[best.i];
          this.lastOwner = {
            x: best.x,
            y: best.y,
            size: best.sz,
            handedness: hd && hd.score >= this.handednessFlipConfidence ? hd.categoryName : this.lastOwner.handedness,
            handednessScore: hd ? hd.score : 0,
          };
        }
      }

      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
      };
    }

    // Single hand visible
    const hand = lms[0]!;
    const wrist = hand[0];
    if (!wrist) {
      this.activeNumHands = 2;
      this.lastOwner = null;
      this.lockedStreak = 0;
      return {
        landmarks: [],
        handedness: [],
        nextNumHands: 2,
        failClosedReason: null,
        triggeredHandednessProbe: false,
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
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: 2,
          failClosedReason: "owner-jump-reject",
          triggeredHandednessProbe: false,
        };
      }

      if (sRatio > this.maxSizeRatio) {
        this.ownerSizeRejects++;
        this.lockedStreak = 0;
        this.framesSinceAudit = 0;
        this.lastOwner = null;
        this.activeNumHands = 2;
        return {
          landmarks: [],
          handedness: [],
          nextNumHands: 2,
          failClosedReason: "owner-size-reject",
          triggeredHandednessProbe: false,
        };
      }

      // High-confidence handedness flip at close range -> immediate 2-hand verification probe on next frame
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
        };
        return {
          landmarks: lms,
          handedness: hds,
          nextNumHands: 2,
          failClosedReason: null,
          triggeredHandednessProbe: true,
        };
      }

      this.lastOwner = {
        x: wrist.x,
        y: wrist.y,
        size: sz,
        handedness: hdName ?? this.lastOwner.handedness,
        handednessScore: hd?.score ?? this.lastOwner.handednessScore,
      };
      this.lockedStreak++;
      this.framesSinceAudit++;
      return {
        landmarks: lms,
        handedness: hds,
        nextNumHands: 1,
        failClosedReason: null,
        triggeredHandednessProbe: false,
      };
    }

    // Currently in numHands=2 with 1 visible hand
    this.lastOwner = {
      x: wrist.x,
      y: wrist.y,
      size: sz,
      handedness: hdName ?? this.lastOwner?.handedness ?? null,
      handednessScore: hd?.score ?? 0,
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

    return {
      landmarks: lms,
      handedness: hds,
      nextNumHands: this.activeNumHands,
      failClosedReason: null,
      triggeredHandednessProbe: false,
    };
  }

  telemetry(): OwnerGuardTelemetry {
    return {
      activeNumHands: this.activeNumHands,
      bystanderAudits: this.bystanderAudits,
      bystanderDetections: this.bystanderDetections,
      ownerJumpRejects: this.ownerJumpRejects,
      ownerSizeRejects: this.ownerSizeRejects,
      handednessProbes: this.handednessProbes,
      bystanderCooldown: this.bystanderCooldown,
    };
  }
}
