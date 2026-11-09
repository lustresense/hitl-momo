// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClassroomSession } from "@/src/app/hooks/useClassroomSession";

describe("useClassroomSession hook", () => {
  it("initializes without session by default", () => {
    const { result } = renderHook(() => useClassroomSession());
    expect(result.current.isJoined).toBe(false);
    expect(result.current.session).toBe(null);
  });

  it("fetches class info when initialJoinToken is provided", async () => {
    const { result } = renderHook(() =>
      useClassroomSession({
        initialJoinToken: "tok-123",
        apiBaseUrl: "https://api.test",
      })
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.joinToken).toBe("tok-123");
  });
});
