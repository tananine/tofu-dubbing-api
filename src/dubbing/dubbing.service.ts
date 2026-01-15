import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GenerateDubbingDto } from './dto/generate-dubbing.dto.js';
import { StorageService } from '../storage/storage.service.js';
import { MessageCodes } from '../common/message-codes.js';
import { TranslationService } from '../translation/translation.service.js';
import { getAIProvider, isAIModel } from '../common/ai-models.constants.js';

const execAsync = promisify(exec);

export interface AudioFile {
  index: number;
  buffer: Buffer | null;
  text: string;
  start: number;
  end: number;
  key: string;
  url: string;
  cached: boolean;
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

  async generateDubbing(generateDubbingDto: GenerateDubbingDto) {
    const { subtitles, config, videoDetails } = generateDubbingDto;

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

    if (config.model && isAIModel(config.model)) {
      const provider = getAIProvider(config.model);
      if (provider) {
        try {
          const translatedText = await this.translationService.translateText(
            {
              text: normalizedSubtitle.sourceText,
              fromLanguage: 'auto',
              toLanguage: config.toLanguage,
              model: config.model,
            },
            provider,
          );
          normalizedSubtitle.targetText = translatedText;
        } catch (error) {}
      }
    }

    const key = this.buildStorageKey(normalizedSubtitle, config, videoDetails);
    const fileExists = await this.storageService.fileExists(key);

    if (fileExists) {
      return this.createCachedAudioFile(normalizedSubtitle, key);
    }

    return this.generateNewAudioFile(normalizedSubtitle, config, key);
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
    const escapedText = subtitle.targetText.replace(/"/g, '\\"');
    const command = `python3 ${this.SCRIPT_PATH} "${escapedText}" "${config.voice}"`;

    const { stdout } = await execAsync(command, {
      encoding: 'buffer',
      maxBuffer: this.MAX_BUFFER_SIZE,
    });

    return {
      index: subtitle.index,
      buffer: stdout as Buffer,
      text: subtitle.targetText,
      start: subtitle.start,
      end: subtitle.end,
      key,
      url: '',
      cached: false,
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

  private buildResponse(
    audioFiles: AudioFile[],
    errors: AudioError[],
    videoId: string,
  ) {
    const cachedCount = audioFiles.filter((a) => a.cached).length;
    const audioFilesWithUrls = audioFiles.map(
      ({ index, url, text, start, end, cached }) => ({
        index,
        url,
        text,
        start,
        end,
        cached,
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
