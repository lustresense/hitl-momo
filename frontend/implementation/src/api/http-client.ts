export type ApiErrorCode =
  | "timeout"
  | "network"
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "payload-too-large"
  | "unprocessable"
  | "server-error"
  | "malformed-response"
  | "unknown";

export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly originalError?: unknown;

  constructor(options: {
    message: string;
    code: ApiErrorCode;
    status?: number;
    requestId?: string;
    originalError?: unknown;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status ?? 0;
    this.requestId = options.requestId;
    this.originalError = options.originalError;
  }
}

export interface HttpClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 400) return "bad-request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 408) return "timeout";
  if (status === 409) return "conflict";
  if (status === 413) return "payload-too-large";
  if (status === 422) return "unprocessable";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server-error";
  return "unknown";
}

/**
 * The session token goes only to the class backend's relative /api/ paths.
 * An absolute URL (possibly another origin) never gets it.
 */
export function isClassApiPath(path: string): boolean {
  if (/^https?:\/\//i.test(path)) return false;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean.startsWith("/api/");
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider?: () => string | undefined | Promise<string | undefined>;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").trim().replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...(a as Parameters<typeof fetch>)));
    this.tokenProvider = options.tokenProvider;
  }

  private resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  private async buildHeaders(customHeaders: Record<string, string> | undefined, attachToken: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(customHeaders ?? {}),
    };

    // Token only for the class backend's own /api/ paths (see isClassApiPath).
    if (attachToken && this.tokenProvider && !headers["authorization"]) {
      try {
        const token = await this.tokenProvider();
        if (token) {
          headers["authorization"] = `Bearer ${token}`;
        }
      } catch {
        throw new ApiError({
          code: "unauthorized",
          status: 401,
          message: "Gagal mengambil token sesi autentikasi.",
        });
      }
    }

    return headers;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const controller = new AbortController();
    const timeoutDuration = options.timeoutMs ?? this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    const onExternalAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", onExternalAbort);
      }
    }

    try {
      const headers = await this.buildHeaders(options.headers, isClassApiPath(path));
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      let responseData: unknown = null;
      const text = await res.text();
      if (text.trim().length > 0) {
        try {
          responseData = JSON.parse(text);
        } catch {
          if (!res.ok) {
            throw new ApiError({
              code: statusToCode(res.status),
              status: res.status,
              message: `Server merespons ${res.status}: ${text.slice(0, 100)}`,
            });
          }
          throw new ApiError({
            code: "malformed-response",
            status: res.status,
            message: "Respons server bukan format JSON yang valid.",
          });
        }
      }

      if (!res.ok) {
        let code = statusToCode(res.status);
        let message = `Permintaan gagal dengan status ${res.status}.`;
        let requestId: string | undefined;

        if (responseData && typeof responseData === "object") {
          const envelope = responseData as ApiErrorEnvelope;
          if (envelope.error) {
            message = envelope.error.message || message;
            requestId = envelope.error.requestId;
          } else if ("detail" in (responseData as Record<string, unknown>)) {
            const detail = (responseData as { detail: unknown }).detail;
            message = typeof detail === "string" ? detail : JSON.stringify(detail);
          }
        }

        throw new ApiError({
          code,
          status: res.status,
          message,
          requestId,
        });
      }

      return responseData as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;

      const isAbort =
        (err as { name?: string })?.name === "AbortError" ||
        (err as { name?: string })?.name === "TimeoutError" ||
        controller.signal.aborted;

      if (isAbort) {
        throw new ApiError({
          code: "timeout",
          status: 408,
          message: "Permintaan HTTP melebihi batas waktu (timeout).",
          originalError: err,
        });
      }

      throw new ApiError({
        code: "network",
        status: 0,
        message: err instanceof Error ? err.message : "Kesalahan koneksi jaringan.",
        originalError: err,
      });
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }
}
