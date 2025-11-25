import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'code' in exceptionResponse
    ) {
      response.status(status).json(exceptionResponse);
    } else {
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string | string[] })?.message ||
            'Internal server error';

      response.status(status).json({
        code: 'INTERNAL_ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
      });
    }
  }
}
