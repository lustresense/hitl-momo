import { describe, expect, it } from "vitest";
import { createOwnerLock } from "@/src/nui/sources/hand";

describe("createOwnerLock (Plan §5.3.4 R1)", () => {
  it("locks onto the first visible open hand and ignores closed hands", () => {
    const lock = createOwnerLock();
    expect(lock.owner()).toBeNull();

    // Closed hands cannot claim ownership
    expect(lock.update(0, [{ id: 1, open: false }], 250)).toBeNull();
    expect(lock.owner()).toBeNull();

    // First open hand wins even if preceded by closed hand or followed by another open hand
    expect(
      lock.update(
        33,
        [
          { id: 1, open: false },
          { id: 2, open: true },
          { id: 3, open: true },
        ],
        250,
      ),
    ).toBe(2);
    expect(lock.owner()).toBe(2);
  });

  it("ignores bystanders while owner is present (even when owner pinches) or briefly missing <= T_gap", () => {
    const lock = createOwnerLock();
    expect(lock.update(0, [{ id: 1, open: true }], 300)).toBe(1);

    // Owner pinches (open=false) and bystander enters open -> owner stays 1
    expect(
      lock.update(
        50,
        [
          { id: 2, open: true },
          { id: 1, open: false },
        ],
        300,
      ),
    ).toBe(1);

    // Owner temporarily vanishes for <= 300 ms while bystander waves open -> STILL 1!
    expect(lock.update(150, [{ id: 2, open: true }], 300)).toBe(1);
    expect(lock.update(350, [{ id: 2, open: true }], 300)).toBe(1); // 350 - 50 = 300 === T_gap

    // Owner returns at boundary -> lock refreshed
    expect(
      lock.update(
        350,
        [
          { id: 2, open: true },
          { id: 1, open: false },
        ],
        300,
      ),
    ).toBe(1);
  });

  it("releases ownership only when owner is missing > T_gap and hands control to next open hand", () => {
    const lock = createOwnerLock();
    expect(lock.update(100, [{ id: 1, open: true }], 250)).toBe(1);

    // Absent 250 ms -> still locked
    expect(lock.update(350, [{ id: 2, open: true }], 250)).toBe(1);

    // Absent 251 ms (> 250 ms) with closed bystander -> released to null
    expect(lock.update(351, [{ id: 2, open: false }], 250)).toBeNull();
    expect(lock.owner()).toBeNull();

    // Bystander opens -> becomes new owner
    expect(lock.update(384, [{ id: 2, open: true }], 250)).toBe(2);

    // Immediate transfer when previous owner expires > T_gap while open bystander is present
    expect(lock.update(635, [{ id: 3, open: true }], 250)).toBe(3);
  });

  it("clears ownership on reset()", () => {
    const lock = createOwnerLock();
    lock.update(0, [{ id: 1, open: true }], 250);
    expect(lock.owner()).toBe(1);
    lock.reset();
    expect(lock.owner()).toBeNull();
    expect(lock.update(10, [{ id: 2, open: true }], 250)).toBe(2);
  });
});
