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
