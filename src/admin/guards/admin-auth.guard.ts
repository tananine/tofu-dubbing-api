import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  AdminKeyNotConfiguredException,
  InvalidAuthorizationHeaderException,
  InvalidAdminKeyException,
} from '../../common/exceptions/admin.exceptions.js';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const adminKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!adminKey) {
      throw new AdminKeyNotConfiguredException();
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new InvalidAuthorizationHeaderException();
    }

    const token = authHeader.substring(7);

    if (token !== adminKey) {
      throw new InvalidAdminKeyException();
    }

    return true;
  }
}
