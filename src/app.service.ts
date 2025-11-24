import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'Server is running',
      timestamp: new Date().toISOString(),
    };
  }
}
