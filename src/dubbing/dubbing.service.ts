import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseBuffer } from 'music-metadata';
import { sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { GenerateDubbingDto } from './dto/generate-dubbing.dto.js';
import { StartDubbingDto } from './dto/start-dubbing.dto.js';
import { StorageService } from '../storage/storage.service.js';
import { MessageCodes } from '../common/message-codes.js';
import { TranslationService } from '../translation/translation.service.js';
import { getAIProvider, isAIModel } from '../common/ai-models.constants.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { UsageLogsService } from '../users/usage-logs.service.js';
import { DATABASE_CONNECTION } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import { dubbingLogs, aiModelUsage } from '../database/schema.js';
import {
  getProxyRetryCount,
  markProxyFailure,
  markProxySuccess,
  pickRandomProxy,
} from '../common/proxy-pool.js';

const execFileAsync = promisify(execFile);

export interface AudioFile {
  index: number;
  buffer: Buffer | null;
  text: string;
  start: number;
  end: number;
  key: string;
  url: string;
  cached: boolean;
  duration?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
  };
}

export interface AudioError {
  index: number;
  error: string;
}

@Injectable()
export class DubbingService {
  private readonly CONCURRENT_LIMIT = 5;
  private readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024;
  private readonly SCRIPT_PATH = 'scripts/edge-tts-generate.py';

  constructor(
    private readonly storageService: StorageService,
    private readonly translationService: TranslationService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageLogsService: UsageLogsService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  private roundToTwoDecimals(value: number): number {
    return Number(value.toFixed(2));
  }

  private normalizeSubtitleTimestamps(subtitle: any) {
    return {
      ...subtitle,
      start: this.roundToTwoDecimals(subtitle.start),
      end: this.roundToTwoDecimals(subtitle.end),
    };
  }

  async startSession(
    dto: StartDubbingDto,
    userId: number,
  ): Promise<{ isPro: boolean }> {
    const isPro = await this.subscriptionsService.isPro(userId);
    await this.db.insert(dubbingLogs).values({
      userId,
      sourceLanguage: dto.sourceLanguage,
      targetLanguage: dto.targetLanguage,
      pageUrl: dto.pageUrl ?? null,
      isPro,
    });
    return { isPro };
  }

  async generateDubbing(
    generateDubbingDto: GenerateDubbingDto,
    userId: number,
  ) {
    const { subtitles, config, videoDetails } = generateDubbingDto;

    if (config.model && isAIModel(config.model)) {
      const isPro = await this.subscriptionsService.isPro(userId);
      if (!isPro) {
        throw new ForbiddenException(MessageCodes.AI_MODEL_REQUIRES_PRO);
      }
    }

    const audioFiles: AudioFile[] = [];
    const errors: AudioError[] = [];

    await this.processSubtitlesInBatches(
      subtitles,
      config,
      videoDetails,
      audioFiles,
      errors,
    );

    await this.uploadGeneratedAudioFiles(audioFiles);

    await this.trackAudioDuration(audioFiles, userId, config.model);

    return this.buildResponse(audioFiles, errors, videoDetails.videoId);
  }

  private async processSubtitlesInBatches(
    subtitles: any[],
    config: any,
    videoDetails: any,
    audioFiles: AudioFile[],
    errors: AudioError[],
  ) {
    for (let i = 0; i < subtitles.length; i += this.CONCURRENT_LIMIT) {
      const batch = subtitles.slice(i, i + this.CONCURRENT_LIMIT);
      await this.processBatch(batch, config, videoDetails, audioFiles, errors);
    }
  }

  private async processBatch(
    batch: any[],
    config: any,
    videoDetails: any,
    audioFiles: AudioFile[],
    errors: AudioError[],
  ) {
    const results = await Promise.allSettled(
      batch.map((subtitle) =>
        this.processSubtitle(subtitle, config, videoDetails),
      ),
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        audioFiles.push(result.value);
      } else {
        errors.push({
          index: batch[idx].index,
          error: result.reason?.message || MessageCodes.UNKNOWN_ERROR,
        });
      }
    });
  }

  private async processSubtitle(
    subtitle: any,
    config: any,
    videoDetails: any,
  ): Promise<AudioFile> {
    const normalizedSubtitle = this.normalizeSubtitleTimestamps(subtitle);

    let tokenUsage: AudioFile['tokenUsage'];

    if (config.model && isAIModel(config.model)) {
      const provider = getAIProvider(config.model);
      if (provider) {
        try {
          const result = await this.translationService.translateText(
            {
              text: normalizedSubtitle.sourceText,
              fromLanguage: 'auto',
              toLanguage: config.toLanguage,
              model: config.model,
            },
            provider,
          );
          normalizedSubtitle.targetText = result.text;
          tokenUsage = result.usage;
        } catch (error) {}
      }
    }

    const key = this.buildStorageKey(normalizedSubtitle, config, videoDetails);
    const fileExists = await this.storageService.fileExists(key);

    if (fileExists) {
      return this.createCachedAudioFile(normalizedSubtitle, key);
    }

    const audioFile = await this.generateNewAudioFile(
      normalizedSubtitle,
      config,
      key,
    );
    return { ...audioFile, tokenUsage };
  }

  private buildStorageKey(
    subtitle: any,
    config: any,
    videoDetails: any,
  ): string {
    const textHash = createHash('sha256')
      .update(subtitle.targetText || '')
      .digest('hex')
      .slice(0, 16);

    return `youtube/${videoDetails.videoId}/${config.toLanguage}/${config.voice}/tts-${subtitle.index}-${subtitle.start}-${subtitle.end}-${textHash}.mp3`;
  }

  private createCachedAudioFile(subtitle: any, key: string): AudioFile {
    return {
      index: subtitle.index,
      buffer: null,
      text: subtitle.targetText,
      start: subtitle.start,
      end: subtitle.end,
      key,
      url: this.storageService.getCdnUrl(key),
      cached: true,
    };
  }

  private async generateNewAudioFile(
    subtitle: any,
    config: any,
    key: string,
  ): Promise<AudioFile> {
    let cleanedText = subtitle.targetText;
    const excludedProxies = new Set<string>();
    const maxAttempts = Math.max(1, getProxyRetryCount() + 1);
    let stdout: Buffer | string | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const proxyUrl = pickRandomProxy(excludedProxies);
      try {
        const result = await execFileAsync(
          'python3',
          [this.SCRIPT_PATH, cleanedText, config.voice, proxyUrl],
          {
            encoding: 'buffer',
            maxBuffer: this.MAX_BUFFER_SIZE,
          },
        );
        stdout = result.stdout;
        markProxySuccess(proxyUrl);
        lastError = undefined;
        break;
      } catch (error) {
        markProxyFailure(proxyUrl);
        if (proxyUrl) excludedProxies.add(proxyUrl);
        lastError = error;
      }
    }

    if (!stdout) {
      throw lastError instanceof Error ? lastError : new Error('TTS generation failed');
    }

    let duration = 0;
    try {
      const metadata = await parseBuffer(stdout as Buffer, {
        mimeType: 'audio/mpeg',
      });
      duration = metadata.format.duration || 0;
    } catch (error) {}

    return {
      index: subtitle.index,
      buffer: stdout as Buffer,
      text: subtitle.targetText,
      start: subtitle.start,
      end: subtitle.end,
      key,
      url: '',
      cached: false,
      duration,
    };
  }

  private async uploadGeneratedAudioFiles(audioFiles: AudioFile[]) {
    const filesToUpload = audioFiles
      .filter((audio) => !audio.cached && audio.buffer)
      .map((audio) => ({
        buffer: audio.buffer!,
        key: audio.key,
      }));

    if (filesToUpload.length === 0) return;

    const uploadedFiles =
      await this.storageService.uploadBuffers(filesToUpload);

    audioFiles.forEach((audio) => {
      if (!audio.cached) {
        const uploaded = uploadedFiles.find((u) => u.key === audio.key);
        if (uploaded) {
          audio.url = uploaded.url;
        }
      }
    });
  }

  private async trackAudioDuration(
    audioFiles: AudioFile[],
    userId: number,
    model?: string,
  ): Promise<void> {
    const newAudioFiles = audioFiles.filter((a) => !a.cached);
    const totalDuration = newAudioFiles.reduce(
      (sum, audio) => sum + (audio.duration || 0),
      0,
    );

    if (totalDuration > 0) {
      await this.usageLogsService.incrementDailyUsage(
        userId,
        totalDuration,
        newAudioFiles.length,
      );
    }

    if (!model || !isAIModel(model)) return;

    const subscription =
      await this.subscriptionsService.findActiveByUserId(userId);
    if (!subscription) return;

    const totalInputTokens = newAudioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.inputTokens ?? 0),
      0,
    );
    const totalOutputTokens = newAudioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.outputTokens ?? 0),
      0,
    );
    const totalCachedTokens = newAudioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.cachedTokens ?? 0),
      0,
    );
    const totalCacheWriteTokens = newAudioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.cacheWriteTokens ?? 0),
      0,
    );

    await this.db
      .insert(aiModelUsage)
      .values({
        subscriptionId: subscription.id,
        userId,
        model,
        periodStart: subscription.currentPeriodStart,
        totalDuration,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
        cacheWriteTokens: totalCacheWriteTokens,
      })
      .onConflictDoUpdate({
        target: [
          aiModelUsage.subscriptionId,
          aiModelUsage.periodStart,
          aiModelUsage.model,
        ],
        set: {
          totalDuration: sql`${aiModelUsage.totalDuration} + ${totalDuration}`,
          inputTokens: sql`${aiModelUsage.inputTokens} + ${totalInputTokens}`,
          outputTokens: sql`${aiModelUsage.outputTokens} + ${totalOutputTokens}`,
          cachedTokens: sql`${aiModelUsage.cachedTokens} + ${totalCachedTokens}`,
          cacheWriteTokens: sql`${aiModelUsage.cacheWriteTokens} + ${totalCacheWriteTokens}`,
          updatedAt: new Date(),
        },
      });
  }

  private buildResponse(
    audioFiles: AudioFile[],
    errors: AudioError[],
    videoId: string,
  ) {
    const cachedCount = audioFiles.filter((a) => a.cached).length;
    const audioFilesWithUrls = audioFiles.map(
      ({ index, url, text, start, end, cached, duration }) => ({
        index,
        url,
        text,
        start,
        end,
        cached,
        duration,
      }),
    );

    return {
      message: MessageCodes.DUBBING_GENERATION_COMPLETED,
      videoId,
      totalFiles: audioFilesWithUrls.length,
      successCount: audioFilesWithUrls.length,
      cachedCount,
      generatedCount: audioFilesWithUrls.length - cachedCount,
      errorCount: errors.length,
      audioFiles: audioFilesWithUrls,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
