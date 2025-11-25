import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

interface ExceptionResponseWithCode {
  code: string;
  message?: string | string[];
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (this.hasCode(exceptionResponse)) {
      response.status(status).json(exceptionResponse);
      return;
    }

    const message = this.extractMessage(exceptionResponse);
    response.status(status).json({ code: 'INTERNAL_ERROR', message });
  }

  private hasCode(response: unknown): response is ExceptionResponseWithCode {
    return (
      typeof response === 'object' && response !== null && 'code' in response
    );
  }

  private extractMessage(response: unknown): string {
    if (typeof response === 'string') {
      return response;
    }

    const msg = (response as { message?: string | string[] })?.message;

    if (Array.isArray(msg)) {
      return msg.join(', ');
    }

    return msg || 'Internal server error';
  }
}
