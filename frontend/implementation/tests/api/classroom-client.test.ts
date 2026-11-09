// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ClassroomClient, StudentSessionStore } from "@/src/api/classroom-client";

describe("ClassroomClient", () => {
  it("getClassInfo fetches /api/join/{token}", async () => {
    let capturedPath = "";
    const fetchImpl: typeof fetch = async (url) => {
      capturedPath = String(url);
      return new Response(
        JSON.stringify({
          class_name: "Kelas 7A",
          school_name: "SMP Negeri 1",
          student_count: 24,
          taken_numbers: [1, 2, 5],
        }),
        { status: 200 }
      );
    };

    const client = new ClassroomClient({ baseUrl: "https://api.example.com", fetchImpl });
    const info = await client.getClassInfo("join-abc-123");

    expect(capturedPath).toBe("https://api.example.com/api/join/join-abc-123");
    expect(info.class_name).toBe("Kelas 7A");
    expect(info.taken_numbers).toEqual([1, 2, 5]);
  });

  it("joinStudent posts student details, saves session to store and returns token", async () => {
    let requestBody: unknown = null;
    const fetchImpl: typeof fetch = async (_, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          student_id: 42,
          number: 7,
          name: "Budi",
          class_name: "Kelas 7A",
          student_session_token: "tok_session_789",
          expires_in: 7200,
        }),
        { status: 200 }
      );
    };

    const store = new StudentSessionStore();
    const client = new ClassroomClient({ baseUrl: "https://api.example.com", fetchImpl }, store);

    const session = await client.joinStudent("join-abc-123", { number: 7, name: "Budi" });

    expect(requestBody).toEqual({ number: 7, name: "Budi" });
    expect(session.student_id).toBe(42);
    expect(session.student_session_token).toBe("tok_session_789");
    expect(store.getToken()).toBe("tok_session_789");
  });

  it("getModelInfo fetches /api/v1/model-info", async () => {
    const fetchImpl: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          contractVersion: "1.0",
          modelVersion: "quickdraw-cnn-v2",
          labels: ["balok", "batu", "papan"],
          topK: 3,
        }),
        { status: 200 }
      );
    };

    const client = new ClassroomClient({ baseUrl: "https://api.example.com", fetchImpl });
    const modelInfo = await client.getModelInfo();
    expect(modelInfo.contractVersion).toBe("1.0");
    expect(modelInfo.labels).toEqual(["balok", "batu", "papan"]);
  });
});

describe("ClassroomClient session persistence", () => {
  it("joinStudent stores the join token with the session so a reload can restore it", async () => {
    window.sessionStorage.clear();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ student_id: 3, number: 5, name: "Ani", class_name: "7A", student_session_token: "tok_s", expires_in: 28800 }),
        { status: 200 }
      );
    const client = new ClassroomClient({ baseUrl: "https://api.example.com", fetchImpl });

    await client.joinStudent("join-abc-123", { number: 5, name: "Ani" });

    expect(client.sessionStore.getSession()?.join_token).toBe("join-abc-123");
    expect(new StudentSessionStore().getSession()?.join_token).toBe("join-abc-123");
  });
});
