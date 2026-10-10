import { HttpErrorResponse } from '@angular/common/http';

export function formatHttpError(err: HttpErrorResponse, fallback: string): string {
  if (err.status === 0) {
    return 'Cannot reach the API. Start it with: cd api && npm run start:dev';
  }
  const body = err.error as { message?: string | string[] } | null;
  const msg = body?.message;
  if (Array.isArray(msg)) {
    return msg.join('. ');
  }
  if (typeof msg === 'string') {
    return msg;
  }
  return fallback;
}

/**
 * Drop blank optional values from a form payload before sending it.
 *
 * A reactive form reports an untouched optional field as `''`. The API treats
 * a present-but-empty value as a real value and validates it, so `''` fails
 * every enum, email, date and id rule. Omitting the key is what "left blank"
 * actually means.
 */
export function omitBlank<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}
