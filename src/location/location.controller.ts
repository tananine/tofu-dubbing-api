import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LocationService } from './location.service.js';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('detect')
  detectLocation(@Req() req: Request) {
    const ipAddress = this.getClientIp(req);
    const location = this.locationService.detectLocation(ipAddress);

    return {
      ip: ipAddress,
      ...location,
    };
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0] : null) ||
      req.socket.remoteAddress ||
      '0.0.0.0';

    return ip.replace('::ffff:', '');
  }
}
