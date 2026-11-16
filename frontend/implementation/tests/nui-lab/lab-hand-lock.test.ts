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

describe("automatic relock after an actually empty frame interval", () => {
  it("automatically acquires one new hand after all candidates disappeared", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.12,.6,.19)],0);
    expect(lock.pick([handAt(.12,.6,.19)],33).status).toBe("locked");
    const original = lock.acquisitionId;
    expect(lock.pick([],90).status).toBe("lost");
    expect(lock.pick([],400)).toEqual({index:null,status:"waiting"});
    expect(lock.pick([handAt(.88,.6,.19)],433)).toEqual({index:null,status:"locking"});
    expect(lock.pick([handAt(.88,.6,.19)],466)).toEqual({index:0,status:"locked"});
    expect(lock.acquisitionId).toBeGreaterThan(original);
  });
  it("does not mistake a single dropped frame for an empty-camera recovery", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.15,.5,.2)],0);lock.pick([handAt(.15,.5,.2)],33);
    lock.pick([],100);
    expect(lock.pick([handAt(.84,.5,.2)],450)).toEqual({index:null,status:"lost"});
    expect(lock.pick([handAt(.84,.5,.2)],483)).toEqual({index:null,status:"lost"});
  });
  it("does not hand a background stranger control while that stranger remains visible", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.16,.6,.2)],0);lock.pick([handAt(.16,.6,.2)],33);
    for(let i=1;i<=14;i++) {
      const result=lock.pick([handAt(.82,.6,.22)],33+i*125);
      expect(result.index).toBeNull();
      expect(result.status).toBe("lost");
    }
    expect(lock.acquisitionId).toBe(1);
  });
  it("reacquires after a sufficiently long empty gap even if no sampled frame lands on the timeout", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.15,.6,.2)],0);
    lock.pick([handAt(.15,.6,.2)],33);
    const before = lock.acquisitionId;
    lock.pick([],100);
    lock.pick([],140);
    expect(lock.pick([handAt(.82,.6,.2)],420)).toEqual({index:null,status:"locking"});
    expect(lock.pick([handAt(.82,.6,.2)],453)).toEqual({index:0,status:"locked"});
    expect(lock.acquisitionId).toBeGreaterThan(before);
  });
  it("waits when two hands arrive together after an empty interval", () => {
    const lock = new FullFrameHandLock();
    lock.pick([handAt(.16,.6,.2)],0);lock.pick([handAt(.16,.6,.2)],33);
    lock.pick([],100);lock.pick([],450);
    expect(lock.pick([handAt(.16,.6,.2),handAt(.84,.6,.2)],490).status).toBe("ambiguous");
    expect(lock.pick([handAt(.84,.6,.2)],520).status).toBe("locking");
    expect(lock.pick([handAt(.84,.6,.2)],554).status).toBe("locked");
  });
  it("ignores invalid or too small landmarks without promoting them", () => {
    const lock = new FullFrameHandLock();
    const bad = handAt(.5,.5,.2);bad[3] = {x:NaN,y:0.5};
    expect(lock.pick([bad],0).status).toBe("waiting");
    expect(lock.pick([handAt(.5,.5,.02)],33).index).toBeNull();
  });
});

describe("stale track action isolation", () => {
  it("allocates a new ownership epoch when the last known wrist returns after a long interruption", () => {
    const lock=new FullFrameHandLock();
    lock.pick([handAt(.45,.6,.2)],0);
    lock.pick([handAt(.45,.6,.2)],33);
    const before=lock.acquisitionId;
    expect(lock.pick([handAt(.45,.6,.2)],900)).toEqual({index:null,status:"locking"});
    expect(lock.pick([handAt(.45,.6,.2)],933)).toEqual({index:0,status:"locked"});
    expect(lock.acquisitionId).toBeGreaterThan(before);
  });
});
