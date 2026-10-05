import type { ErrorApi } from "@iris/shared-types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

// Sent on every request. The session routes ask for it, and a page on
// another site can't add it without CORS checking first (see
// identity-service app/api/session_cookie.py).
const CLIENT_HEADER = "X-Iris-Client";
const CLIENT_HEADER_VALUE = "web";

// Requests the page makes by itself (lists refreshed every so often) say
// so: they don't count as activity, so they don't keep a teacher's panel
// open after 15 min without anyone using it.
const ACTIVITY_HEADER = "X-Iris-Activity";
const BACKGROUND_ACTIVITY = "background";

// The teacher's panel closed after a while without activity.
const TWO_FACTOR_REQUIRED = "verificacion_2fa_requerida";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface AuthHandlers {
  getAccessToken: () => string | null;
  /** Tries to renew the access token. Returns the new token or null if it failed. */
  refresh: () => Promise<string | null>;
  onAuthFailure: () => void;
}

let authHandlers: AuthHandlers | null = null;

export function configureAuthHandlers(handlers: AuthHandlers): void {
  authHandlers = handlers;
}

// Set by the teacher's portal while it's open: asks for the 2FA code and
// says whether it was typed, so the request can be made once more.
let twoFactorHandler: (() => Promise<boolean>) | null = null;

export function configureTwoFactorHandler(handler: (() => Promise<boolean>) | null): void {
  twoFactorHandler = handler;
}

// A request that found the teacher's panel closed waits for the code and
// is made once more. Without a handler, or if the code wasn't typed, the
// error goes on as usual.
async function retryAfterCode(error: ApiError, alreadyRetried: boolean): Promise<boolean> {
  if (alreadyRetried || error.code !== TWO_FACTOR_REQUIRED || !twoFactorHandler) return false;
  return twoFactorHandler();
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // defaults to true, sends the access token if there is one
  /** A request the page makes by itself, not the person (see ACTIVITY_HEADER). */
  background?: boolean;
  /** true on the internal retry request after a refresh, so it doesn't loop */
  _isRetry?: boolean;
  /** true on the retry after typing the 2FA code, so it doesn't loop */
  _isRetry2fa?: boolean;
}

async function readApiError(response: Response): Promise<ApiError> {
  let error: ErrorApi["error"] = { code: "error_desconocido", message: `Error inesperado (${response.status}).` };
  try {
    const data = (await response.json()) as ErrorApi;
    if (data?.error?.code) error = data.error;
  } catch {
    /* response without a JSON body, keeps the generic message */
  }
  return new ApiError(response.status, error.code, error.message, error.details);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, auth = true, background = false, headers, _isRetry, _isRetry2fa, ...rest } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Accept", "application/json");
  finalHeaders.set(CLIENT_HEADER, CLIENT_HEADER_VALUE);
  if (background) finalHeaders.set(ACTIVITY_HEADER, BACKGROUND_ACTIVITY);
  if (body !== undefined) finalHeaders.set("Content-Type", "application/json");

  if (auth && authHandlers) {
    const token = authHandlers.getAccessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  // "include" so the session cookie is kept and sent also in local dev,
  // where the API is on another port. Its path keeps it on /auth only.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && auth && authHandlers && !_isRetry) {
    const nuevoToken = await authHandlers.refresh();
    if (nuevoToken) {
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
    authHandlers.onAuthFailure();
  }

  if (!response.ok) {
    const error = await readApiError(response);
    if (await retryAfterCode(error, Boolean(_isRetry2fa))) {
      return apiFetch<T>(path, { ...options, _isRetry2fa: true });
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Shared by uploads and image downloads: sends the access token and, on a
// 401, refreshes the session once and retries. Any other error becomes an ApiError.
async function fetchWithSession(
  path: string,
  init: RequestInit = {},
  isRetry = false,
  isRetry2fa = false,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = authHandlers?.getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401 && authHandlers && !isRetry) {
    const nuevoToken = await authHandlers.refresh();
    if (nuevoToken) return fetchWithSession(path, init, true, isRetry2fa);
    authHandlers.onAuthFailure();
  }

  if (!response.ok) {
    const error = await readApiError(response);
    if (await retryAfterCode(error, isRetry2fa)) return fetchWithSession(path, init, isRetry, true);
    throw error;
  }
  return response;
}

/** Downloads a private file (a classroom logo, a lesson image) with the
 * user's session. An `<img src>` can't send the Authorization header, so
 * images are fetched here and shown from the returned Blob. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetchWithSession(path);
  return response.blob();
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetchWithSession(path, { method: "POST", body: formData });
  return (await response.json()) as T;
}
