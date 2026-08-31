import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { parseStream } from 'music-metadata';
import { and, eq, sql } from 'drizzle-orm';
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

export interface AudioFile {
  index: number;
  buffer: Buffer | null;
  text: string;
  start: number;
  end: number;
  key: string;
  url: string;
  cached: boolean;
  responseType: 'prx' | 'ip';
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
  private readonly logger = new Logger(DubbingService.name);
  private readonly CONCURRENT_LIMIT = 5;
  private readonly SCRIPT_PATH = 'scripts/edge-tts-generate.py';
  private readonly YTDLP_COOKIES_FILE = process.env.YTDLP_COOKIES_FILE ?? '';

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
  ): Promise<{ dubbingLogId: number; isPro: boolean }> {
    const isPro = await this.subscriptionsService.isPro(userId);
    const [log] = await this.db
      .insert(dubbingLogs)
      .values({
        userId,
        sourceLanguage: dto.sourceLanguage,
        targetLanguage: dto.targetLanguage,
        pageUrl: dto.pageUrl ?? null,
        isPro,
      })
      .returning({ id: dubbingLogs.id });
    return { dubbingLogId: log.id, isPro };
  }

  async generateDubbing(
    generateDubbingDto: GenerateDubbingDto,
    userId: number,
  ) {
    const { dubbingLogId, subtitles, config, videoDetails } =
      generateDubbingDto;

    const [dubbingLog] = await this.db
      .select({
        id: dubbingLogs.id,
        generateStarted: dubbingLogs.generateStarted,
      })
      .from(dubbingLogs)
      .where(
        and(eq(dubbingLogs.id, dubbingLogId), eq(dubbingLogs.userId, userId)),
      )
      .limit(1);
    if (!dubbingLog) {
      throw new NotFoundException('dubbingLogNotFound');
    }

    if (!dubbingLog.generateStarted) {
      await this.db
        .update(dubbingLogs)
        .set({ generateStarted: 1 })
        .where(eq(dubbingLogs.id, dubbingLogId));
    }

    if (config.model && isAIModel(config.model)) {
      const isPro = await this.subscriptionsService.isPro(userId);
      if (!isPro) {
        throw new ForbiddenException(MessageCodes.AI_MODEL_REQUIRES_PRO);
      }
    }

    const audioFiles: AudioFile[] = [];
    const errors: AudioError[] = [];

    try {
      await this.processSubtitlesInBatches(
        subtitles,
        config,
        videoDetails,
        audioFiles,
        errors,
      );

      await this.trackAudioDuration(
        audioFiles,
        userId,
        dubbingLogId,
        config.model,
      );

      return this.buildResponse(audioFiles, errors, videoDetails.videoId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `dubbingLogId=${dubbingLogId} userId=${userId} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.db
        .update(dubbingLogs)
        .set({ errorMessage: message.slice(0, 2000) })
        .where(
          and(eq(dubbingLogs.id, dubbingLogId), eq(dubbingLogs.userId, userId)),
        );
      throw error;
    }
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
        } catch (error) {
          this.logger.warn(
            `AI translation failed, falling back to sourceText: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    const key = this.buildStorageKey(normalizedSubtitle, config, videoDetails);
    const fileExists = await this.storageService.fileExists(key);

    if (fileExists) {
      return this.createCachedAudioFile(normalizedSubtitle, key, tokenUsage);
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

  private createCachedAudioFile(
    subtitle: any,
    key: string,
    tokenUsage?: AudioFile['tokenUsage'],
  ): AudioFile {
    return {
      index: subtitle.index,
      buffer: null,
      text: subtitle.targetText,
      start: subtitle.start,
      end: subtitle.end,
      key,
      url: this.storageService.getCdnUrl(key),
      cached: true,
      responseType: 'ip',
      tokenUsage,
    };
  }

  private async generateNewAudioFile(
    subtitle: any,
    config: any,
    key: string,
  ): Promise<AudioFile> {
    const cleanedText = subtitle.targetText;
    const excludedProxies = new Set<string>();
    const maxAttempts = Math.max(1, getProxyRetryCount() + 1);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const proxyUrl = pickRandomProxy(excludedProxies, 'generate-voice');
      try {
        const { url, duration } = await this.streamTtsToStorage(
          cleanedText,
          config.voice,
          proxyUrl,
          key,
        );
        markProxySuccess(proxyUrl);
        return {
          index: subtitle.index,
          buffer: null,
          text: subtitle.targetText,
          start: subtitle.start,
          end: subtitle.end,
          key,
          url,
          cached: false,
          responseType: proxyUrl ? 'prx' : 'ip',
          duration,
        };
      } catch (error) {
        markProxyFailure(proxyUrl);
        if (proxyUrl) excludedProxies.add(proxyUrl);
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('TTS generation failed');
  }

  // Streams the python script's stdout straight into the S3 upload (and, via
  // a second pipe, into the duration parser) instead of buffering the whole
  // audio file in Node memory before uploading — keeps peak RAM bounded when
  // many dubbing sessions run concurrently.
  private streamTtsToStorage(
    text: string,
    voice: string,
    proxyUrl: string,
    key: string,
  ): Promise<{ url: string; duration: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn('python3', [this.SCRIPT_PATH, text, voice, proxyUrl]);

      const {
        stream: uploadStream,
        done: uploadDone,
        abort,
      } = this.storageService.createStreamUpload(key);
      const metadataInput = new PassThrough();
      child.stdout.pipe(uploadStream);
      child.stdout.pipe(metadataInput);

      const durationPromise = parseStream(
        metadataInput,
        { mimeType: 'audio/mpeg' },
        { duration: true },
      )
        .then((metadata) => metadata.format.duration || 0)
        .catch(() => 0)
        .finally(() => {
          // music-metadata can stop reading once it has enough header data
          // to compute duration, leaving the rest of the piped stream
          // un-drained. Since metadataInput shares its source (child.stdout)
          // with uploadStream, an un-drained metadataInput backpressures
          // and stalls the upload pipe too — force-drain any leftover bytes.
          metadataInput.resume();
        });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString();
      });

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        void abort();
        reject(new Error('TTS generation timed out'));
      }, 90_000);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void abort();
        reject(error);
      });

      child.on('close', (code) => {
        if (code !== 0 && !settled) {
          settled = true;
          clearTimeout(timeout);
          void abort();
          reject(
            new Error(stderr.trim() || `TTS process exited with code ${code}`),
          );
        }
      });

      Promise.all([uploadDone, durationPromise])
        .then(([url, duration]) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ url, duration });
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async trackAudioDuration(
    audioFiles: AudioFile[],
    userId: number,
    dubbingLogId: number,
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

    const totalInputTokens = audioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.inputTokens ?? 0),
      0,
    );
    const totalOutputTokens = audioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.outputTokens ?? 0),
      0,
    );
    const totalCachedTokens = audioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.cachedTokens ?? 0),
      0,
    );
    const totalCacheWriteTokens = audioFiles.reduce(
      (sum, a) => sum + (a.tokenUsage?.cacheWriteTokens ?? 0),
      0,
    );
    const usedAi = Boolean(model && isAIModel(model));

    await this.db
      .update(dubbingLogs)
      .set({
        model: usedAi ? model : dubbingLogs.model,
        usedAi: usedAi ? true : dubbingLogs.usedAi,
        aiInputTokens: sql`${dubbingLogs.aiInputTokens} + ${totalInputTokens}`,
        aiOutputTokens: sql`${dubbingLogs.aiOutputTokens} + ${totalOutputTokens}`,
        aiCachedTokens: sql`${dubbingLogs.aiCachedTokens} + ${totalCachedTokens}`,
        aiCacheWriteTokens: sql`${dubbingLogs.aiCacheWriteTokens} + ${totalCacheWriteTokens}`,
        audioDuration: sql`${dubbingLogs.audioDuration} + ${totalDuration}`,
        completedAt: new Date(),
      })
      .where(
        and(eq(dubbingLogs.id, dubbingLogId), eq(dubbingLogs.userId, userId)),
      );

    if (!usedAi || !model) return;

    const subscription =
      await this.subscriptionsService.findActiveByUserId(userId);
    const periodStart =
      subscription?.currentPeriodStart ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    await this.db
      .insert(aiModelUsage)
      .values({
        subscriptionId: subscription?.id ?? null,
        userId,
        model,
        periodStart,
        totalDuration,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
        cacheWriteTokens: totalCacheWriteTokens,
      })
      .onConflictDoUpdate({
        target: [
          aiModelUsage.userId,
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
      ({ index, url, text, start, end, cached, responseType, duration }) => ({
        index,
        url,
        text,
        start,
        end,
        cached,
        responseType,
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

  async fetchSubtitlesViaYtDlp(
    dubbingLogId: number,
    videoId: string,
    language: string | undefined,
    userId: number,
  ): Promise<{
    videoId: string;
    language: string;
    subtitles: Array<{ index: number; start: number; end: number; text: string }>;
  }> {
    const [dubbingLog] = await this.db
      .select({ id: dubbingLogs.id })
      .from(dubbingLogs)
      .where(
        and(eq(dubbingLogs.id, dubbingLogId), eq(dubbingLogs.userId, userId)),
      )
      .limit(1);
    if (!dubbingLog) {
      throw new NotFoundException('dubbingLogNotFound');
    }

    const resolvedLanguage = language ?? 'en';
    const workDir = await mkdtemp(join(tmpdir(), 'yt-dlp-'));
    const excludedProxies = new Set<string>();
    const maxAttempts = Math.max(1, getProxyRetryCount() + 1);
    let lastError: unknown;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const proxyUrl = pickRandomProxy(excludedProxies, 'yt-dlp');
        try {
          await this.runYtDlp(videoId, resolvedLanguage, workDir, proxyUrl);
          markProxySuccess(proxyUrl);

          const vttFile = (await readdir(workDir)).find((name) =>
            name.endsWith('.vtt'),
          );
          if (!vttFile) {
            throw new NotFoundException(MessageCodes.SUBTITLE_NOT_FOUND);
          }

          const vttContent = await readFile(join(workDir, vttFile), 'utf8');
          const subtitles = this.parseVtt(vttContent);
          if (subtitles.length === 0) {
            throw new NotFoundException(MessageCodes.SUBTITLE_NOT_FOUND);
          }

          await this.db
            .update(dubbingLogs)
            .set({ fetchSubApi: 1 })
            .where(eq(dubbingLogs.id, dubbingLogId));

          return { videoId, language: resolvedLanguage, subtitles };
        } catch (error) {
          if (error instanceof NotFoundException) throw error;
          markProxyFailure(proxyUrl);
          if (proxyUrl) excludedProxies.add(proxyUrl);
          lastError = error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new BadRequestException(MessageCodes.SUBTITLE_FETCH_FAILED);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private runYtDlp(
    videoId: string,
    language: string,
    workDir: string,
    proxyUrl: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        language,
        '--sub-format',
        'vtt',
        '--convert-subs',
        'vtt',
        '-o',
        join(workDir, '%(id)s.%(ext)s'),
      ];

      if (proxyUrl) args.push('--proxy', proxyUrl);
      if (this.YTDLP_COOKIES_FILE) {
        // android/web_safari clients don't accept cookie auth well; let
        // yt-dlp use its default (web) client so the cookies are honored.
        args.push('--cookies', this.YTDLP_COOKIES_FILE);
      } else {
        args.push(
          '--extractor-args',
          'youtube:player_client=android,web_safari',
        );
      }

      args.push('--', `https://www.youtube.com/watch?v=${videoId}`);

      const child = spawn('yt-dlp', args);

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString();
      });

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new BadRequestException(MessageCodes.SUBTITLE_FETCH_FAILED));
      }, 30_000);

      child.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new BadRequestException(MessageCodes.SUBTITLE_FETCH_FAILED));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code !== 0) {
          this.logger.warn(
            `yt-dlp failed for videoId=${videoId} lang=${language}: ${stderr.trim()}`,
          );
          reject(new BadRequestException(MessageCodes.SUBTITLE_FETCH_FAILED));
          return;
        }
        resolve();
      });
    });
  }

  private parseVtt(
    content: string,
  ): Array<{ index: number; start: number; end: number; text: string }> {
    const timeToSeconds = (time: string): number => {
      const [h, m, s] = time.replace(',', '.').split(':');
      return Number(h) * 3600 + Number(m) * 60 + Number(s);
    };

    const stripTags = (line: string): string =>
      line
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();

    const cueTimeRegex =
      /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

    const blocks = content.replace(/\r/g, '').split('\n\n');
    const cues: Array<{ index: number; start: number; end: number; text: string }> =
      [];
    let lastText = '';

    for (const block of blocks) {
      const lines = block.split('\n').filter(Boolean);
      const timeLine = lines.find((line) => cueTimeRegex.test(line));
      if (!timeLine) continue;

      const match = timeLine.match(cueTimeRegex);
      if (!match) continue;

      const text = lines
        .slice(lines.indexOf(timeLine) + 1)
        .map(stripTags)
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!text || text === lastText) continue;
      lastText = text;

      cues.push({
        index: cues.length,
        start: timeToSeconds(match[1]),
        end: timeToSeconds(match[2]),
        text,
      });
    }

    return cues;
  }
}
