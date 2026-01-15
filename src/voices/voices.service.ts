import { BadRequestException, Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class VoicesService {
  private readonly MAX_BUFFER_SIZE = 5 * 1024 * 1024;
  private readonly EDGE_TTS_LIST_SCRIPT = 'scripts/edge-tts-list-voices.py';

  async getVoicesByType(voiceType: string) {
    switch (voiceType) {
      case 'edge-tts':
        return this.getEdgeTtsVoices();
      case 'azure-tts':
        return [];
      default:
        throw new BadRequestException(`Unsupported voiceType: ${voiceType}`);
    }
  }

  async getEdgeTtsVoices() {
    const { stdout } = await execAsync(
      `python3 ${this.EDGE_TTS_LIST_SCRIPT}`,
      {
        maxBuffer: this.MAX_BUFFER_SIZE,
      },
    );
    return JSON.parse(stdout);
  }
}
