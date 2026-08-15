import { Logger } from '@nestjs/common';
import { createRequire } from 'node:module';

/**
 * Error reporting sink.
 *
 * Sentry is an optional dependency: if `@sentry/node` is installed and
 * `SENTRY_DSN` is set, unhandled errors are forwarded there; otherwise they are
 * logged as single-line JSON, which is what a log-shipping stack can actually
 * query. Either way the reporting call site is the same, so wiring an APM later
 * is a dependency install rather than an edit to every error path.
 */

export interface ErrorContext {
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  organizationId?: string;
  userId?: string;
}

type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, hint?: Record<string, unknown>) => void;
};

let sentry: SentryLike | null = null;
let initialised = false;
const logger = new Logger('ErrorReporter');

/**
 * Called once at boot. Safe to call when Sentry is not installed — the module
 * is resolved lazily and a missing package downgrades to log-only reporting.
 */
export function initErrorReporting(): void {
  if (initialised) return;
  initialised = true;

  const dsn = (process.env['SENTRY_DSN'] ?? '').trim();
  if (!dsn) {
    logger.log('No SENTRY_DSN set — errors will be logged as JSON only.');
    return;
  }

  try {
    // Resolved through createRequire rather than a static import: Sentry is an
    // optional dependency, so a bare import would make the whole module fail to
    // load on a deployment that never installed it.
    const req = createRequire(__filename);
    const mod = req('@sentry/node') as SentryLike;
    mod.init({
      dsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      release: process.env['APP_RELEASE'],
      tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? 0),
    });
    sentry = mod;
    logger.log('Sentry error reporting enabled.');
  } catch {
    logger.warn(
      'SENTRY_DSN is set but @sentry/node is not installed. ' +
        'Run `npm i @sentry/node` to enable error reporting; falling back to JSON logs.',
    );
  }
}

/** Reports an unhandled error. Never throws — reporting must not mask the original failure. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    if (sentry) {
      sentry.captureException(error, { extra: { ...context } });
    }

    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      JSON.stringify({
        level: 'error',
        message: err.message,
        name: err.name,
        ...context,
        stack: err.stack,
      }),
    );
  } catch {
    // Deliberately silent: a failure inside the reporter must not replace the
    // error we were trying to report.
  }
}
