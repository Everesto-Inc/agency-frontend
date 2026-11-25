import type { components } from './schema';

export type ErrorDetail = components['schemas']['ErrorDetail'];

/** Every backend error uses { error: { code, message, request_id, details } }. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string | null,
              public details?: Record<string, unknown> | null) {
    super(message);
  }

  static async from(res: Response): Promise<ApiError> {
    try {
      const body = await res.json();
      const e = body?.error as ErrorDetail | undefined;
      if (e?.message) return new ApiError(res.status, e.code, e.message, e.request_id, (e as { details?: Record<string, unknown> }).details);
      // FastAPI validation errors (422) come as { detail: [...] }
      if (Array.isArray(body?.detail)) return new ApiError(res.status, 'VALIDATION', body.detail.map((d: { msg: string }) => d.msg).join(' · '));
    } catch { /* not JSON */ }
    return new ApiError(res.status, 'HTTP_' + res.status, res.statusText || 'Request failed');
  }
}

export const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong';
