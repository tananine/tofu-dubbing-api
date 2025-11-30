import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service.js';

@Injectable()
export class ProGuard implements CanActivate {
  constructor(private subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    const isPro = await this.subscriptionsService.isPro(user.id);
    if (!isPro) {
      throw new ForbiddenException('Pro subscription required');
    }

    return true;
  }
}
