import { API_PREFIX, resolveApiUrl } from "./config";
import { tokenStore } from "./token-store";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // If true, attempt token refresh on 401. Default true.
  retryOn401?: boolean;
  // If true, don't attach the bearer token (used by /auth endpoints).
  unauth?: boolean;
};

// Single in-flight refresh promise — avoids a thundering herd of 401s all
// triggering parallel refresh calls.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = await tokenStore.loadRefresh();
    if (!refresh) return false;
    try {
      const res = await fetch(`${resolveApiUrl()}${API_PREFIX}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        await tokenStore.clear();
        return false;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await tokenStore.save({ access: data.accessToken, refresh: data.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = `${resolveApiUrl()}${API_PREFIX}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (!options.unauth) {
    const access = await tokenStore.loadAccess();
    if (access) headers["Authorization"] = `Bearer ${access}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.unauth && options.retryOn401 !== false) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return api<T>(path, { ...options, retryOn401: false });
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (parsed as { error?: string; message?: string }) ?? {};
    throw new ApiError(res.status, err.error ?? "request_failed", err.message ?? `HTTP ${res.status}`, parsed);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
