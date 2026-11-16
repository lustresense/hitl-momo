/**
 * Owner-only experimental full-frame lock, not a change to the student's face-gated input.
 * Never takes over another hand automatically after the original lock is lost.
 * A camera landmark is not a biometric identity. Crossing/occlusion remains ambiguous.
 */
import { handSize, isLargeEnough, MAX_JUMP, LOCK_LOST_MS } from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";

export type LabLockStatus = "waiting" | "locking" | "locked" | "lost" | "ambiguous";
export interface LabLockPick { index: number | null; status: LabLockStatus }
interface Candidate { wrist: { x: number; y: number }; size: number; frames: number }
interface LockedHand { wrist: { x: number; y: number }; size: number; lastSeenMs: number }
const REACQUIRE_SIZE_RATIO = 1.7;
const AMBIGUITY_GAP = 0.045;
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);
const compatibleSize = (a:number,b:number) => Math.max(a,b) / Math.max(1e-6,Math.min(a,b)) <= REACQUIRE_SIZE_RATIO;

export class FullFrameHandLock {
  private pending: Candidate | null = null;
  private locked: LockedHand | null = null;
  private statusNow: LabLockStatus = "waiting";

  get status(): LabLockStatus { return this.statusNow; }

  reset(): void {
    this.pending = null;
    this.locked = null;
    this.statusNow = "waiting";
  }

  pick(hands: Landmark[][], nowMs: number): LabLockPick {
    const valid = hands.flatMap((h,i) =>
      h.length >= 21 && isLargeEnough(h) && h[0]
        ? [{index:i,wrist:h[0]!,size:handSize(h)}] : []);
    if (!this.locked) {
      if (valid.length !== 1) {
        this.pending = null;
        this.statusNow = valid.length > 1 ? "ambiguous" : "waiting";
        return { index:null,status:this.statusNow };
      }
      const only = valid[0]!;
      if (this.pending && distance(this.pending.wrist,only.wrist)<=MAX_JUMP
          && compatibleSize(this.pending.size,only.size)) {
        this.pending={wrist:only.wrist,size:only.size,frames:this.pending.frames+1};
      } else {
        this.pending={wrist:only.wrist,size:only.size,frames:1};
      }
      if (this.pending.frames < 2) {
        this.statusNow="locking";
        return {index:null,status:this.statusNow};
      }
      this.locked={wrist:only.wrist,size:only.size,lastSeenMs:nowMs};
      this.pending=null;
      this.statusNow="locked";
      return {index:only.index,status:this.statusNow};
    }

    // A long loss never unlocks to the largest bystander. Owner must press Relock.
    if (nowMs - this.locked.lastSeenMs > LOCK_LOST_MS) {
      this.statusNow="lost";
      return {index:null,status:this.statusNow};
    }
    const candidates=valid
      .filter(h=>distance(h.wrist,this.locked!.wrist)<=MAX_JUMP && compatibleSize(h.size,this.locked!.size))
      .map(h=>({...h,d:distance(h.wrist,this.locked!.wrist)}))
      .sort((a,b)=>a.d-b.d);
    if (candidates.length > 1 && candidates[1]!.d - candidates[0]!.d < AMBIGUITY_GAP) {
      this.statusNow="ambiguous";
      return {index:null,status:this.statusNow};
    }
    const selected=candidates[0];
    if (!selected) {
      this.statusNow="lost";
      return {index:null,status:this.statusNow};
    }
    this.locked={wrist:selected.wrist,size:selected.size,lastSeenMs:nowMs};
    this.statusNow="locked";
    return {index:selected.index,status:this.statusNow};
  }
}
