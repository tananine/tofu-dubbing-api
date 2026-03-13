import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { UsersService } from '../users/users.service.js';
import { UsageLogsService } from '../users/usage-logs.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { LocationService } from '../location/location.service.js';
import { DATABASE_CONNECTION } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import { loginLogs } from '../database/schema.js';
import { RegisterDto } from './dto/register.dto.js';
import { MessageCodes } from '../common/message-codes.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
    private usageLogsService: UsageLogsService,
    private locationService: LocationService,
    @Inject(DATABASE_CONNECTION)
    private db: PostgresJsDatabase<typeof schema>,
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
    const todayUsage = await this.usageLogsService.getTodayUsage(userId);
    
    return { 
      ...result, 
      isPro,
      audioUsage: todayUsage,
    };
  }

  async logLogin(userId: number, ip: string | undefined): Promise<void> {
    let country: string | null = null;
    if (ip) {
      try {
        const location = this.locationService.detectLocation(ip);
        country =
          location.country && location.country !== 'unknown'
            ? location.country
            : null;
      } catch {}
    }
    await this.db.insert(loginLogs).values({
      userId,
      country,
      ip: ip ?? null,
    });
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException(MessageCodes.EMAIL_ALREADY_EXISTS);
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
