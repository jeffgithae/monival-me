import {
  ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger,
} from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import type { Response } from 'express';

/**
 * Maps Mongoose/BSON errors that reach the top level to client-appropriate
 * responses instead of opaque 500s:
 *  - CastError (malformed ObjectId in a param/filter) → 400
 *  - Duplicate key (E11000)                           → 409
 *
 * Anything else is rethrown to Nest's default handler. Without this, any
 * request carrying a bad id (`/projects/abc`) both 500s and leaks internals
 * into the logs as unhandled exceptions.
 */
@Catch(MongooseError.CastError, MongooseError.ValidationError)
export class MongoErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongoErrorFilter.name);

  catch(exception: MongooseError.CastError | MongooseError.ValidationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof MongooseError.CastError) {
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: `Invalid ${exception.path === '_id' ? 'id' : exception.path} format`,
      });
      return;
    }

    // Mongoose schema validation that slipped past DTO validation
    this.logger.warn(`Mongoose validation error: ${exception.message}`);
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Invalid data submitted',
    });
  }
}
