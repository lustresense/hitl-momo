import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http-client";

export interface ClassInfo {
  class_name: string;
  school_name?: string;
  student_count: number;
  taken_numbers: number[];
}

export interface JoinStudentRequest {
  number?: number;
  name: string;
  client_id?: string;
}

export interface StudentSession {
  student_id: number;
  number: number;
  name: string;
  class_name?: string;
  student_session_token: string;
  /** Class join token used to join. Stored so a reload can rebuild the class context. */
  join_token?: string;
  expires_in?: number;
  joined_at: string;
}

export interface ModelInfo {
  contractVersion: string;
  modelVersion: string;
  labels: string[];
  topK: number;
  coordinateSystem?: string;
}

const SESSION_STORAGE_KEY = "sketchbook_student_session";
const CLIENT_ID_STORAGE_KEY = "momo.studentClientId";

function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `momo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class StudentSessionStore {
  private inMemorySession: StudentSession | null = null;
  private inMemoryClientId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        const item = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (item) {
          this.inMemorySession = JSON.parse(item) as StudentSession;
        }
        const storedClientId = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (storedClientId) {
          this.inMemoryClientId = storedClientId;
        }
      } catch {
        /* storage disabled or restricted */
      }
    }
  }

  getSession(): StudentSession | null {
    return this.inMemorySession;
  }

  getToken(): string | undefined {
    return this.inMemorySession?.student_session_token;
  }

  getOrCreateClientId(): string {
    if (this.inMemoryClientId) return this.inMemoryClientId;
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (existing) {
          this.inMemoryClientId = existing;
          return existing;
        }
      } catch {
        /* storage disabled */
      }
    }
    const created = generateClientId();
    this.inMemoryClientId = created;
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
      } catch {
        /* storage disabled */
      }
    }
    return created;
  }

  clearClientId(): void {
    this.inMemoryClientId = null;
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(CLIENT_ID_STORAGE_KEY);
      } catch {
        /* storage disabled */
      }
    }
  }

  setSession(session: StudentSession): void {
    this.inMemorySession = session;
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        /* storage disabled */
      }
    }
  }

  clearSession(): void {
    this.inMemorySession = null;
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        /* storage disabled */
      }
    }
  }
}

export class ClassroomClient {
  private readonly http: HttpClient;
  readonly sessionStore: StudentSessionStore;

  constructor(options: HttpClientOptions = {}, sessionStore?: StudentSessionStore) {
    this.sessionStore = sessionStore ?? new StudentSessionStore();
    this.http = new HttpClient({
      ...options,
      tokenProvider: () => this.sessionStore.getToken(),
    });
  }

  async getClassInfo(joinToken: string, options?: RequestOptions): Promise<ClassInfo> {
    return this.http.get<ClassInfo>(`/api/join/${encodeURIComponent(joinToken)}`, options);
  }

  async joinStudent(
    joinToken: string,
    payload: JoinStudentRequest,
    options?: RequestOptions
  ): Promise<StudentSession> {
    const body: JoinStudentRequest = { name: payload.name };
    if (payload.number !== undefined) body.number = payload.number;
    if (payload.client_id) body.client_id = payload.client_id;
    const res = await this.http.post<StudentSession>(
      `/api/join/${encodeURIComponent(joinToken)}/students`,
      body,
      options
    );
    const session: StudentSession = {
      ...res,
      join_token: joinToken,
      joined_at: res.joined_at || new Date().toISOString(),
    };
    this.sessionStore.setSession(session);
    return session;
  }

  /**
   * @deprecated The backend has no /api/v1/model-info (contracts/API_INVENTORY.md, PROPOSED).
   * Not called at runtime. Do not use until the endpoint exists in the backend.
   */
  async getModelInfo(options?: RequestOptions): Promise<ModelInfo> {
    return this.http.get<ModelInfo>("/api/v1/model-info", options);
  }
}
