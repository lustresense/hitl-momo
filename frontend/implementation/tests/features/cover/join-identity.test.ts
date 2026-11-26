import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotSupportedError,
  getActiveJoinStrategy,
  nameOnly,
  rulerPlusName,
  type JoinIdentityContext,
} from "@/src/features/cover/join/join-identity";
import type { StudentSession } from "@/src/api/classroom-client";

const MOCK_SESSION: StudentSession = {
  student_id: 7,
  number: 12,
  name: "Rani Putri",
  class_name: "7A",
  student_session_token: "tok-123",
  join_token: "kelas-abc",
  joined_at: "2026-11-25T00:00:00.000Z",
};

describe("join-identity (O-3 & §5.5)", () => {
  const originalFlag = process.env.NEXT_PUBLIC_JOIN_NAME_ONLY;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_JOIN_NAME_ONLY;
    } else {
      process.env.NEXT_PUBLIC_JOIN_NAME_ONLY = originalFlag;
    }
  });

  it("rulerPlusName needs number ONLY when a non-empty joinToken is present", () => {
    expect(rulerPlusName.needsNumber({ joinToken: null })).toBe(false);
    expect(rulerPlusName.needsNumber({ joinToken: "" })).toBe(false);
    expect(rulerPlusName.needsNumber({ joinToken: "   " })).toBe(false);
    expect(rulerPlusName.needsNumber({ joinToken: "kelas-abc" })).toBe(true);
  });

  it("rulerPlusName normalizes name and forwards (number, name) to joinClass", async () => {
    const joinClass = vi.fn(async (_num: number, _name: string) => MOCK_SESSION);
    const ctx: JoinIdentityContext = { joinToken: "kelas-abc", joinClass };

    const session = await rulerPlusName.join(ctx, "halo nama saya rani putri", 12);
    expect(joinClass).toHaveBeenCalledTimes(1);
    expect(joinClass).toHaveBeenCalledWith(12, "Rani Putri");
    expect(session).toEqual(MOCK_SESSION);
  });

  it("rulerPlusName rejects missing/invalid number or empty name", async () => {
    const joinClass = vi.fn(async () => MOCK_SESSION);
    const ctx: JoinIdentityContext = { joinToken: "kelas-abc", joinClass };

    await expect(rulerPlusName.join(ctx, "Rani")).rejects.toThrow();
    await expect(rulerPlusName.join(ctx, "Rani", 0)).rejects.toThrow();
    await expect(rulerPlusName.join(ctx, "Rani", 1.5)).rejects.toThrow();
    await expect(rulerPlusName.join(ctx, "   ", 5)).rejects.toThrow();
    await expect(rulerPlusName.join({ joinToken: null, joinClass }, "Rani", 5)).rejects.toThrow();
    expect(joinClass).not.toHaveBeenCalled();
  });

  it("nameOnly is DISABLED and always throws NotSupportedError even when NEXT_PUBLIC_JOIN_NAME_ONLY=1", async () => {
    process.env.NEXT_PUBLIC_JOIN_NAME_ONLY = "1";
    const joinClass = vi.fn(async () => MOCK_SESSION);
    const ctx: JoinIdentityContext = { joinToken: "kelas-abc", joinClass };

    expect(nameOnly.needsNumber(ctx)).toBe(false);
    await expect(nameOnly.join(ctx, "Rani")).rejects.toBeInstanceOf(NotSupportedError);
    expect(joinClass).not.toHaveBeenCalled();
    // Active strategy stays rulerPlusName until backend contract exists
    expect(getActiveJoinStrategy().kind).toBe("ruler-plus-name");
  });
});
