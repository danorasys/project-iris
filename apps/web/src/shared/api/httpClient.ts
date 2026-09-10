import type { ErrorApi } from "@iris/shared-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

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

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // defaults to true, sends the access token if there is one
  /** true on the internal retry request after a refresh, so it doesn't loop */
  _isRetry?: boolean;
}

async function parseErrorBody(response: Response): Promise<ErrorApi["error"]> {
  try {
    const data = (await response.json()) as ErrorApi;
    if (data?.error?.code) return data.error;
  } catch {
    /* response without a JSON body, falls through to the generic message below */
  }
  return { code: "error_desconocido", message: `Error inesperado (${response.status}).` };
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, auth = true, headers, _isRetry, ...rest } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Accept", "application/json");
  if (body !== undefined) finalHeaders.set("Content-Type", "application/json");

  if (auth && authHandlers) {
    const token = authHandlers.getAccessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
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
    const error = await parseErrorBody(response);
    throw new ApiError(response.status, error.code, error.message, error.details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiUpload<T>(path: string, formData: FormData, _isRetry = false): Promise<T> {
  const finalHeaders = new Headers();
  if (authHandlers) {
    const token = authHandlers.getAccessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: finalHeaders,
    body: formData,
  });

  if (response.status === 401 && authHandlers && !_isRetry) {
    const nuevoToken = await authHandlers.refresh();
    if (nuevoToken) {
      return apiUpload<T>(path, formData, true);
    }
    authHandlers.onAuthFailure();
  }

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiError(response.status, error.code, error.message, error.details);
  }
  return (await response.json()) as T;
}
