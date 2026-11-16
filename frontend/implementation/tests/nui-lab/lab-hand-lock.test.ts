import { describe, expect, it } from "vitest";
import { FullFrameHandLock } from "@/src/components/nui-lab/lab-hand-lock";
import { handAt } from "../camera/hand-points";

describe("owner NUI lab strict full-frame hand lock", () => {
  it("locks a single hand at either edge without a face-region dependency", () => {
    const lock = new FullFrameHandLock();
    expect(lock.pick([handAt(.14, .6, .18)], 0)).toEqual({index:null,status:"locking"});
    expect(lock.pick([handAt(.14, .6, .18)], 33)).toEqual({index:0,status:"locked"});
  });
  it("keeps the first player's hand even when a larger second hand enters", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.14, .6, .18)], 0);
    lock.pick([handAt(.14, .6, .18)], 33);
    expect(lock.pick([handAt(.84, .6, .26),handAt(.16, .6, .18)], 66)).toEqual({index:1,status:"locked"});
  });
  it("never silently promotes an unmatched bystander after a long loss", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.14, .6, .18)], 0);
    lock.pick([handAt(.14, .6, .18)], 33);
    expect(lock.pick([handAt(.84, .6, .22)], 100)).toEqual({index:null,status:"lost"});
    expect(lock.pick([handAt(.84, .6, .22)], 1100)).toEqual({index:null,status:"lost"});
    lock.reset();
    expect(lock.pick([handAt(.84, .6, .22)], 1200)).toEqual({index:null,status:"locking"});
    expect(lock.pick([handAt(.84, .6, .22)], 1233)).toEqual({index:0,status:"locked"});
  });
  it("refuses automatic lock with two equally viable hands present", () => {
    const lock = new FullFrameHandLock();
    expect(lock.pick([handAt(.14, .6, .20),handAt(.84, .6, .20)], 0)).toEqual({index:null,status:"ambiguous"});
    expect(lock.pick([], 33)).toEqual({index:null,status:"waiting"});
  });
  it("freezes rather than guessing when two hand wrists nearly overlap the lock", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.45, .6, .18)], 0);
    lock.pick([handAt(.45, .6, .18)], 33);
    expect(lock.pick([handAt(.46, .6, .18),handAt(.50, .6, .18)], 66)).toEqual({index:null,status:"ambiguous"});
  });
});
