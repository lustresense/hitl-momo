import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClassroomClient,
  StudentSessionStore,
  type ClassInfo,
  type StudentSession,
} from "../../api/classroom-client";
import { SubmissionClient } from "../../api/submission-client";
import { OutboxQueue, type OutboxStats } from "../../api/outbox";
import { env } from "../../config/env";

export interface UseClassroomSessionOptions {
  apiBaseUrl?: string;
  initialJoinToken?: string;
}

export interface UseClassroomSessionResult {
  session: StudentSession | null;
  isJoined: boolean;
  joinToken: string | null;
  joinInfo: ClassInfo | null;
  isLoading: boolean;
  error: string | null;
  outboxStats: OutboxStats;
  joinClass: (studentNumber: number, studentName: string) => Promise<StudentSession>;
  leaveClass: () => void;
  classroomClient: ClassroomClient;
  outbox: OutboxQueue;
}

export function useClassroomSession(options: UseClassroomSessionOptions = {}): UseClassroomSessionResult {
  const baseUrl = options.apiBaseUrl ?? env.apiBaseUrl;
  const sessionStoreRef = useRef(new StudentSessionStore());

  const classroomClient = useMemo(() => {
    return new ClassroomClient({ baseUrl }, sessionStoreRef.current);
  }, [baseUrl]);

  const submissionClient = useMemo(() => {
    return new SubmissionClient({
      baseUrl,
      tokenProvider: () => sessionStoreRef.current.getToken(),
    });
  }, [baseUrl]);

  const outbox = useMemo(() => {
    return new OutboxQueue({
      client: submissionClient,
      tokenProvider: () => sessionStoreRef.current.getToken(),
    });
  }, [submissionClient]);

  const [session, setSession] = useState<StudentSession | null>(() => sessionStoreRef.current.getSession());
  // After a reload the URL may have no query. The stored student session keeps the join token.
  const [joinToken, setJoinToken] = useState<string | null>(
    () => options.initialJoinToken ?? sessionStoreRef.current.getSession()?.join_token ?? null,
  );
  const [joinInfo, setJoinInfo] = useState<ClassInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outboxStats, setOutboxStats] = useState<OutboxStats>({
    pending: 0,
    sending: 0,
    acknowledged: 0,
    blocked: 0,
    failed: 0,
  });

  useEffect(() => {
    return outbox.addListener((stats) => {
      setOutboxStats(stats);
    });
  }, [outbox]);

  // Send jobs left over from a previous page load (tab closed mid-request, or offline).
  useEffect(() => {
    void outbox.resume().catch(() => {
      /* offline or storage error: the next enqueue or online event retries */
    });
  }, [outbox]);

  useEffect(() => {
    if (typeof window !== "undefined" && !joinToken) {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("join") || params.get("join_token") || params.get("kelas");
        if (token) {
          setJoinToken(token);
        }
      } catch {
        /* ignore query read errors */
      }
    }
  }, [joinToken]);

  useEffect(() => {
    if (!joinToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    classroomClient
      .getClassInfo(joinToken)
      .then((info) => {
        if (!cancelled) setJoinInfo(info);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [joinToken, classroomClient]);

  const joinClass = useCallback(
    async (studentNumber: number, studentName: string): Promise<StudentSession> => {
      if (!joinToken) {
        throw new Error("Token kelas tidak tersedia untuk bergabung.");
      }
      setIsLoading(true);
      setError(null);
      try {
        const s = await classroomClient.joinStudent(joinToken, {
          number: studentNumber,
          name: studentName,
        });
        setSession(s);
        // Jobs blocked by an expired session can use the new token now.
        void outbox.requeueUnauthorized().catch(() => {
          /* retried on the next trigger */
        });
        return s;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gagal bergabung ke kelas.";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [joinToken, classroomClient, outbox]
  );

  const leaveClass = useCallback(() => {
    sessionStoreRef.current.clearSession();
    setSession(null);
    setJoinInfo(null);
    setError(null);
  }, []);

  return {
    session,
    isJoined: session !== null,
    joinToken,
    joinInfo,
    isLoading,
    error,
    outboxStats,
    joinClass,
    leaveClass,
    classroomClient,
    outbox,
  };
}
