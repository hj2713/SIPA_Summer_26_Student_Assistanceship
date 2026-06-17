/**
 * Fetch wrapper that attaches the Supabase JWT as an Authorization header.
 *
 * Usage:
 *   const threads = await apiFetch<Thread[]>("/api/threads", session.access_token);
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  jwt: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
    ...(options.headers ?? {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail ?? body.message ?? message;
    } catch {
      // keep default
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content has no body
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}
