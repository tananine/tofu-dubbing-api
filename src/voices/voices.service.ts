import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getProxyRetryCount,
  markProxyFailure,
  markProxySuccess,
  pickRandomProxy,
} from '../common/proxy-pool.js';

const execFileAsync = promisify(execFile);

@Injectable()
export class VoicesService {
  private readonly MAX_BUFFER_SIZE = 5 * 1024 * 1024;
  private readonly EDGE_TTS_LIST_SCRIPT = 'scripts/edge-tts-list-voices.py';

  async getVoicesByType(voiceType: string) {
    switch (voiceType) {
      case 'edge-tts':
        return this.getEdgeTtsVoices();
      default:
        throw new BadRequestException(`Unsupported voiceType: ${voiceType}`);
    }
  }

  async getEdgeTtsVoices() {
    const excludedProxies = new Set<string>();
    const maxAttempts = Math.max(1, getProxyRetryCount() + 1);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const proxyUrl = pickRandomProxy(excludedProxies);
      try {
        const { stdout } = await execFileAsync(
          'python3',
          [this.EDGE_TTS_LIST_SCRIPT, proxyUrl],
          {
            maxBuffer: this.MAX_BUFFER_SIZE,
          },
        );
        markProxySuccess(proxyUrl);
        return {
          voices: JSON.parse(stdout),
          responseType: proxyUrl ? 'prx' : 'ip',
        };
      } catch (error) {
        markProxyFailure(proxyUrl);
        if (proxyUrl) excludedProxies.add(proxyUrl);
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to list voices');
  }
}
