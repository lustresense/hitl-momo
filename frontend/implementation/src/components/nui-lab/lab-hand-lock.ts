/**
 * Experimental NUI Lab owner hand association, not biometric identification.
 * Detects across the whole frame. After a truly empty interval a new single
 * candidate can acquire automatically; an unmatched bystander is NEVER
 * silently promoted while other hands remain visible.
 */
import { handSize, isLargeEnough, MAX_JUMP, LOCK_LOST_MS } from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";

export type LabLockStatus = "waiting" | "locking" | "locked" | "lost" | "ambiguous";
export type LabLockReason =
  | "no-hand" | "validating" | "active" | "temporary-loss" | "empty-reset"
  | "multiple-hands" | "crossing" | "unmatched-hand" | "stale-track";
export interface LabLockPick { index: number | null; status: LabLockStatus; }
interface Candidate { wrist: { x: number; y: number }; size: number; frames: number; lastFrameMs: number; }
interface LockedHand { wrist: { x: number; y: number }; size: number; lastSeenMs: number; }
export const LAB_EMPTY_RESET_MS = 300; // prototype until webcam latency is measured
export const LAB_ACQUIRE_FRAMES = 2;
const REACQUIRE_SIZE_RATIO = 1.7;
const AMBIGUITY_GAP = 0.045;
const distance = (a: { x:number; y:number }, b: { x:number; y:number }) => Math.hypot(a.x-b.x, a.y-b.y);
const compatibleSize = (a:number,b:number) => Math.max(a,b) / Math.max(1e-6, Math.min(a,b)) <= REACQUIRE_SIZE_RATIO;

export class FullFrameHandLock {
  private pending: Candidate | null = null;
  private recovering: Candidate | null = null;
  private locked: LockedHand | null = null;
  private emptySince: number | null = null;
  private emptyFrames = 0;
  private statusNow: LabLockStatus = "waiting";
  private reasonNow: LabLockReason = "no-hand";
  private serial = 0;

  get status(): LabLockStatus { return this.statusNow; }
  get reason(): LabLockReason { return this.reasonNow; }
  /** Changes only when a new ownership session is acquired. */
  get acquisitionId(): number { return this.serial; }
  reset(): void {
    this.pending = null; this.recovering = null; this.locked = null;
    this.emptySince = null; this.emptyFrames = 0; this.statusNow = "waiting"; this.reasonNow = "no-hand";
  }
  private acquire(index: number, wrist: {x:number;y:number}, size: number, nowMs: number): LabLockPick {
    this.locked = { wrist, size, lastSeenMs: nowMs };
    this.pending = null; this.recovering = null;
    this.emptySince = null; this.emptyFrames = 0;
    this.serial++;
    this.statusNow = "locked"; this.reasonNow = "active";
    return { index, status: this.statusNow };
  }
  private seekSingle(valid: {index:number;wrist:{x:number;y:number};size:number}[], nowMs:number): LabLockPick {
    if (valid.length !== 1) {
      this.pending = null;
      this.statusNow = valid.length > 1 ? "ambiguous" : "waiting";
      this.reasonNow = valid.length > 1 ? "multiple-hands" : "no-hand";
      return {index:null, status:this.statusNow};
    }
    const one = valid[0]!;
    const recent = this.pending && nowMs > this.pending.lastFrameMs
      && nowMs - this.pending.lastFrameMs <= 500
      && distance(this.pending.wrist, one.wrist) <= MAX_JUMP
      && compatibleSize(this.pending.size, one.size);
    this.pending = {wrist:one.wrist,size:one.size,frames:recent ? this.pending!.frames+1 : 1,lastFrameMs:nowMs};
    if (this.pending.frames < LAB_ACQUIRE_FRAMES) {
      this.statusNow = "locking"; this.reasonNow = "validating";
      return {index:null,status:this.statusNow};
    }
    return this.acquire(one.index,one.wrist,one.size,nowMs);
  }
  pick(hands: Landmark[][], nowMs: number): LabLockPick {
    const valid = hands.flatMap((h,i) => {
      if (h.length < 21 || !h[0] || !h.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) || !isLargeEnough(h)) return [];
      return [{index:i,wrist:h[0]!,size:handSize(h)}];
    });
    if (!this.locked) return this.seekSingle(valid,nowMs);

    if (valid.length === 0) {
      this.recovering = null;
      if (this.emptySince === null) this.emptySince = nowMs;
      this.emptyFrames++;
      if (this.emptyFrames >= 2 && nowMs - this.emptySince >= LAB_EMPTY_RESET_MS) {
        this.locked = null; this.pending = null;
        this.statusNow = "waiting"; this.reasonNow = "empty-reset";
        return {index:null,status:this.statusNow};
      }
      this.statusNow = "lost"; this.reasonNow = "temporary-loss";
      return {index:null,status:this.statusNow};
    }
    // The camera was empty long enough but had no sampled frame exactly at
    // the threshold; release on this first reappearance without a button.
    if (this.emptySince !== null && this.emptyFrames >= 2 && nowMs - this.emptySince >= LAB_EMPTY_RESET_MS) {
      this.locked = null; this.pending = null; this.recovering = null; this.emptySince = null; this.emptyFrames = 0;
      return this.seekSingle(valid,nowMs);
    }
    this.emptySince = null;
    this.emptyFrames = 0;

    const candidates = valid.filter(h =>
      distance(h.wrist,this.locked!.wrist) <= MAX_JUMP
      && compatibleSize(h.size,this.locked!.size)
    ).map(h => ({...h, d:distance(h.wrist,this.locked!.wrist)})).sort((a,b)=>a.d-b.d);
    if (candidates.length > 1 && candidates[1]!.d - candidates[0]!.d < AMBIGUITY_GAP) {
      this.recovering = null; this.statusNow = "ambiguous"; this.reasonNow = "crossing";
      return {index:null,status:this.statusNow};
    }
    const selected = candidates[0];
    if (!selected) {
      this.recovering = null; this.statusNow = "lost"; this.reasonNow = "unmatched-hand";
      return {index:null,status:this.statusNow};
    }
    const stale = nowMs - this.locked.lastSeenMs > LOCK_LOST_MS;
    if (stale) {
      const recent = this.recovering && nowMs > this.recovering.lastFrameMs
        && nowMs - this.recovering.lastFrameMs <= 500
        && distance(this.recovering.wrist,selected.wrist) <= MAX_JUMP
        && compatibleSize(this.recovering.size,selected.size);
      this.recovering = {wrist:selected.wrist,size:selected.size,frames:recent?this.recovering!.frames+1:1,lastFrameMs:nowMs};
      if(this.recovering.frames < LAB_ACQUIRE_FRAMES) {
        this.statusNow="locking"; this.reasonNow="stale-track";
        return {index:null,status:this.statusNow};
      }
      // A stale-but-compatible return starts a fresh action session: never
      // inherit an old pinch, erase or undo command after a long dropout.
      return this.acquire(selected.index,selected.wrist,selected.size,nowMs);
    }
    this.locked = {wrist:selected.wrist,size:selected.size,lastSeenMs:nowMs};
    this.recovering = null; this.statusNow="locked"; this.reasonNow="active";
    return {index:selected.index,status:this.statusNow};
  }
}
