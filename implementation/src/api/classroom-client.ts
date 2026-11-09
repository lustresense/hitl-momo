import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http-client";

export interface ClassInfo {
  class_name: string;
  school_name?: string;
  student_count: number;
  taken_numbers: number[];
}

export interface JoinStudentRequest {
  number: number;
  name: string;
}

export interface StudentSession {
  student_id: number;
  number: number;
  name: string;
  class_name?: string;
  student_session_token: string;
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

export class StudentSessionStore {
  private inMemorySession: StudentSession | null = null;

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
    const res = await this.http.post<StudentSession>(
      `/api/join/${encodeURIComponent(joinToken)}/students`,
      payload,
      options
    );
    const session: StudentSession = {
      ...res,
      joined_at: res.joined_at || new Date().toISOString(),
    };
    this.sessionStore.setSession(session);
    return session;
  }

  async getModelInfo(options?: RequestOptions): Promise<ModelInfo> {
    return this.http.get<ModelInfo>("/api/v1/model-info", options);
  }
}
