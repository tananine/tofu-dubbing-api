import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req: any) {
    const forwarded = req.headers['x-forwarded-for'];
    const rawIp = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0];
    const ip = (rawIp ?? req.socket?.remoteAddress ?? '')
      .replace(/^::ffff:/, '')
      .trim() || undefined;

    const result = await this.authService.login(req.user);
    this.authService.logLogin(req.user.id, ip).catch(() => {});
    return result;
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }
}
