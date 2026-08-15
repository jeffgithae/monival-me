import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../types/jwt-payload';
import { reportError } from '../observability/error-reporter';

/**
 * Catch-all filter: every unhandled error leaves the process through here, so
 * there is exactly one place that decides what the client sees and one place
 * that reports the failure.
 *
 * Without this, a thrown non-HttpException became a bare 500 with a stack trace
 * in stdout and nothing anywhere else — which is how you end up hearing about
 * production breakage from the customer.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Correlates the response the user saw with the log line and the Sentry
    // event, so a support ticket quoting the id is enough to find the failure.
    const requestId =
      (request.headers['x-request-id'] as string) ?? randomUUID();
    const user = request.user as JwtPayload | undefined;

    // 4xx are expected outcomes (validation, auth, not-found) — they are the
    // client's problem and reporting them would drown real defects in noise.
    // Compared numerically: `status` is a plain number, so a direct enum
    // comparison trips the shared-enum-type rule.
    if (status >= 500) {
      reportError(exception, {
        requestId,
        method: request.method,
        path: request.url,
        statusCode: status,
        organizationId: user?.organizationId,
        userId: user?.sub,
      });
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body, requestId }
            : { ...(body as Record<string, unknown>), requestId },
        );
      return;
    }

    // Never leak an internal error message or stack to the client.
    response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
      requestId,
    });
  }
}
