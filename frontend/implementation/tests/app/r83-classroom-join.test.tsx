// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useR83AppState } from "@/src/app/hooks/useR83AppState";
import { isStageCompleted, recordCompletedStage } from "@/src/app/level-progress";
import { R83SketchbookShell } from "@/src/app/R83SketchbookShell";
import { CoverScreen } from "@/src/features/cover";
import { StudentRulerSelector } from "@/src/components/onboarding/StudentRulerSelector";

function resetState(path = "/") {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", path);
}

describe("r8.3 classroom joinToken, StudentRulerSelector rulerSlot, and WorldScreen level key", () => {
  const prevTestHooks = process.env.NEXT_PUBLIC_TEST_HOOKS;
  const prevApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    resetState("/");
    process.env.NEXT_PUBLIC_TEST_HOOKS = "1";
    process.env.NEXT_PUBLIC_API_BASE_URL = "";
  });

  afterEach(() => {
    cleanup();
    resetState("/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_TEST_HOOKS = prevTestHooks;
    process.env.NEXT_PUBLIC_API_BASE_URL = prevApiBaseUrl;
  });

  it("reads joinToken synchronously, derives joinStatus, forwards ruler number to joinClass, and swallows offline/404 rejection", async () => {
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/students")) {
        return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/?join=kelas-404");

    const { result } = renderHook(() => useR83AppState());
    expect(result.current.classroom.joinToken).toBe("kelas-404");
    expect(result.current.rulerConfirmed).toBe(false);

    await vi.waitFor(() => expect(result.current.joinStatus).toBe("failed"));

    act(() => {
      result.current.handleRulerConfirm(14);
    });
    expect(result.current.rulerConfirmed).toBe(true);

    act(() => {
      result.current.handleCoverComplete({ studentName: "Rani Putri", needsRuler: true });
    });

    await vi.waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/join/kelas-404/students"));
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body).toEqual({ number: 14, name: "Rani Putri", client_id: expect.any(String) });
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/onboarding/card");
    expect(result.current.studentName).toBe("Rani Putri");

    window.removeEventListener("unhandledrejection", unhandled);
  });

  it("joins via same-origin relative URL when NEXT_PUBLIC_API_BASE_URL is empty, omits number (never fabricates 1), and sends client_id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/join/kelas-same" && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({ class_name: "Kelas 3A", school_name: "SDN 1", student_count: 1, taken_numbers: [1] }),
          { status: 200 },
        );
      }
      if (url === "/api/join/kelas-same/students" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            student_id: 101,
            number: 2,
            name: body.name,
            class_name: "Kelas 3A",
            student_session_token: "tok-same-101",
            joined_at: "2026-11-26T00:00:00Z",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ detail: "Unexpected" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/?join=kelas-same");

    const { result } = renderHook(() => useR83AppState());
    await vi.waitFor(() => expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas 3A"));

    await act(async () => {
      await result.current.handleDreamNickname("Budi");
    });

    const postCall = fetchMock.mock.calls.find(([u, i]) => String(u) === "/api/join/kelas-same/students" && i?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toEqual({ name: "Budi", client_id: expect.any(String) });
    expect("number" in body).toBe(false);
    expect(result.current.classroom.isJoined).toBe(true);
    expect(result.current.studentName).toBe("Budi");
  });

  it("reuses session on same-name refresh, but resets and joins with a new client_id when a different child enters on a shared laptop", async () => {
    let nextId = 200;
    const postPayloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/students")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        postPayloads.push(body);
        nextId += 1;
        return new Response(
          JSON.stringify({
            student_id: nextId,
            number: nextId - 200,
            name: body.name,
            class_name: "Kelas 4B",
            student_session_token: `tok-${nextId}`,
            joined_at: "2026-11-26T00:00:00Z",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ class_name: "Kelas 4B", school_name: "SDN 2", student_count: 0, taken_numbers: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/?join=kelas-shared");

    const { result } = renderHook(() => useR83AppState());
    await vi.waitFor(() => expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas 4B"));

    await act(async () => {
      await result.current.handleDreamNickname("Ani");
    });
    expect(postPayloads).toHaveLength(1);
    recordCompletedStage(1);
    expect(isStageCompleted(1)).toBe(true);

    // Same name (case-insensitive) reuses existing session without creating a duplicate row.
    await act(async () => {
      await result.current.handleDreamNickname("ani");
    });
    expect(postPayloads).toHaveLength(1);
    expect(result.current.classroom.session?.student_id).toBe(201);

    // Different child on shared laptop leaves previous session, resets progress, and joins with a fresh client_id.
    await act(async () => {
      await result.current.handleDreamNickname("Budi");
    });
    expect(postPayloads).toHaveLength(2);
    const [firstPayload, secondPayload] = postPayloads;
    if (!firstPayload || !secondPayload) throw new Error("Expected two join payloads");
    expect(secondPayload.name).toBe("Budi");
    expect("number" in secondPayload).toBe(false);
    expect(secondPayload.client_id).toEqual(expect.any(String));
    expect(secondPayload.client_id).not.toBe(firstPayload.client_id);
    expect(result.current.classroom.session?.student_id).toBe(202);
    expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas 4B");
    expect(isStageCompleted(1)).toBe(false);
    expect(result.current.completedStages.size).toBe(0);
  });

  it("clears student session, client_id, studentName, and level progress on ending return while preserving join token and badge", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/students")) {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            student_id: 301,
            number: 1,
            name: body.name,
            class_name: "Kelas 5C",
            student_session_token: "tok-301",
            joined_at: "2026-11-26T00:00:00Z",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ class_name: "Kelas 5C", school_name: "SDN 3", student_count: 1, taken_numbers: [1] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/?join=kelas-end");

    const { result } = renderHook(() => useR83AppState());
    await vi.waitFor(() => expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas 5C"));

    await act(async () => {
      await result.current.handleDreamNickname("Sari");
    });
    recordCompletedStage(1);
    recordCompletedStage(2);
    recordCompletedStage(3);
    expect(window.sessionStorage.getItem("momo.studentClientId")).toBeTruthy();

    act(() => {
      result.current.handleCoverComplete({ studentName: "Sari", needsRuler: false });
    });
    expect(window.location.pathname).toBe("/onboarding/card");

    act(() => {
      result.current.handleEndingChoose();
    });

    expect(result.current.classroom.isJoined).toBe(false);
    expect(result.current.classroom.session).toBeNull();
    expect(result.current.classroom.joinToken).toBe("kelas-end");
    expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas 5C");
    expect(result.current.studentName).toBe("");
    expect(result.current.completedStages.size).toBe(0);
    expect(isStageCompleted(1)).toBe(false);
    expect(window.sessionStorage.getItem("momo.studentClientId")).toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?join=kelas-end");
  });

  it("surfaces HTTP join errors honestly instead of silently swallowing them", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/students")) {
        return new Response(JSON.stringify({ detail: "Kelas sudah penuh" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ class_name: "Kelas Penuh", student_count: 40, taken_numbers: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/?join=kelas-penuh");

    const { result } = renderHook(() => useR83AppState());
    await vi.waitFor(() => expect(result.current.classroom.joinInfo?.class_name).toBe("Kelas Penuh"));

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.handleDreamNickname("Dina");
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Kelas sudah penuh");
    expect(result.current.studentName).toBe("");
    expect(result.current.classroom.isJoined).toBe(false);
    expect(result.current.classroom.error).toBe("Kelas sudah penuh");
  });

  it("leaves non-join flows untouched (hasJoinToken=false has joinStatus='none' and no StudentRulerSelector)", () => {
    window.history.replaceState(null, "", "/");
    render(<R83SketchbookShell />);
    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("r83-entry-name-input")).toBeTruthy();
    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();
    expect(screen.queryByRole("slider", { name: "Nomor absen" })).toBeNull();

    const { result } = renderHook(() => useR83AppState());
    expect(result.current.classroom.joinToken).toBeNull();
    expect(result.current.joinStatus).toBe("none");
  });

  it("renders StudentRulerSelector inside CoverScreen rulerSlot when hasJoinToken=true and completes on confirmation", () => {
    const onComplete = vi.fn();
    let confirmed = false;

    const { rerender } = render(
      <CoverScreen
        hasJoinToken
        initialPhase="ruler"
        rulerSlot={
          !confirmed ? (
            <StudentRulerSelector
              takenNumbers={[5]}
              classStatus="joining"
              onConfirm={() => {
                confirmed = true;
              }}
            />
          ) : undefined
        }
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole("slider", { name: "Nomor absen" })).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    // Once ruler confirms and rulerSlot clears, CoverScreen invokes onComplete
    confirmed = true;
    rerender(<CoverScreen hasJoinToken initialPhase="ruler" rulerSlot={undefined} onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
