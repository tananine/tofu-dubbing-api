import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { ErrorCodes } from '../common/error-codes.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    const isPro = await this.subscriptionsService.isPro(user.id);
    return {
      access_token: this.jwtService.sign(payload),
      isPro,
    };
  }

  async getProfile(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    const { password: _, ...result } = user;
    const isPro = await this.subscriptionsService.isPro(userId);
    return { ...result, isPro };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException(ErrorCodes.EMAIL_ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      email: registerDto.email,
      password: hashedPassword,
    });

    const { password: _, ...result } = user;
    return result;
  }
}
