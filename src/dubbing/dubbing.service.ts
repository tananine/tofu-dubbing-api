import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { StartDubbingDto } from './dto/start-dubbing.dto.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';

const MAX_FREE_DURATION_MS = 15 * 60 * 1000;

export interface PolicyTokenPayload {
  allowDubbing: boolean;
  settings: {
    videoId: string;
    platform: string;
    videoDuration: number;
    sourceLanguage: string;
    targetLanguage: string;
    aiEnabled: boolean;
    aiModel: string;
    voice: string;
    videoVolume: number;
    dubbingVolume: number;
  };
  iat: number;
  exp: number;
}

@Injectable()
export class DubbingService {
  private privateKey: string;

  constructor(
    private configService: ConfigService,
    private subscriptionsService: SubscriptionsService,
  ) {
    const privateKeyBase64 =
      this.configService.get<string>('POLICY_PRIVATE_KEY');
    this.privateKey = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
  }

  async generatePolicyToken(
    userId: number,
    dto: StartDubbingDto,
  ): Promise<string> {
    const isPro = await this.subscriptionsService.isPro(userId);

    const allowDubbing = isPro || dto.videoDuration <= MAX_FREE_DURATION_MS;

    const now = Math.floor(Date.now() / 1000);
    const payload: PolicyTokenPayload = {
      allowDubbing,
      settings: {
        videoId: dto.videoId,
        platform: dto.platform,
        videoDuration: dto.videoDuration,
        sourceLanguage: dto.sourceLanguage!,
        targetLanguage: dto.targetLanguage!,
        aiEnabled: dto.aiEnabled!,
        aiModel: dto.aiModel!,
        voice: dto.voice!,
        videoVolume: dto.videoVolume!,
        dubbingVolume: dto.dubbingVolume!,
      },
      iat: now,
      exp: now + 60 * 60 * 24,
    };

    return this.signJwtRS256(payload);
  }

  private signJwtRS256(payload: object): string {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));

    const signatureInput = `${headerB64}.${payloadB64}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    sign.end();
    const signature = sign.sign(this.privateKey);
    const signatureB64 = this.base64UrlEncodeBuffer(signature);

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private base64UrlEncodeBuffer(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
