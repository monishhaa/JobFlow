import { ApiError } from '../types';

let accessTokenMemory: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export function setAccessToken(token: string | null): void {
  accessTokenMemory = token;
}

export async function refreshAuthToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RequestOptions extends RequestInit {
  retryOn401?: boolean;
}

export class CustomApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  traceId?: string;
  status: number;
  retryAfter?: number;

  constructor(status: number, errorData: Partial<ApiError>, retryAfter?: number) {
    super(errorData.message || `Request failed with status ${status}`);
    this.name = 'CustomApiError';
    this.status = status;
    this.code = errorData.code || 'UNKNOWN_ERROR';
    this.details = errorData.details;
    this.traceId = errorData.traceId;
    this.retryAfter = retryAfter;
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { retryOn401 = true, headers: customHeaders, ...rest } = options;
  
  const headers = new Headers(customHeaders || {});
  if (!headers.has('Content-Type') && !(rest.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;
  let response = await fetch(url, { ...rest, headers });

  if (response.status === 401 && retryOn401) {
    const newToken = await refreshAuthToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...rest, headers });
    } else {
      // Refresh failed, clear session
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }

  if (!response.ok) {
    let errorData: Partial<ApiError> = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText || 'An unexpected error occurred' };
    }

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    throw new CustomApiError(response.status, errorData, retryAfter);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
