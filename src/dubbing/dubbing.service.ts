import { Injectable } from '@nestjs/common';
import { GenerateDubbingDto } from './dto/generate-dubbing.dto.js';

@Injectable()
export class DubbingService {
  async generateDubbing(generateDubbingDto: GenerateDubbingDto) {
    return {
      message: 'Dubbing generation started',
      data: generateDubbingDto,
    };
  }
}

