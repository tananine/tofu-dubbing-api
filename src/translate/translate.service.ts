import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { TranslateDto } from './dto/translate.dto.js';

@Injectable()
export class TranslateService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async translate(dto: TranslateDto): Promise<{ text: string; lang: string }> {
    const response = await this.openai.chat.completions.create({
      model: dto.model,
      messages: [
        {
          role: 'system',
          content: `Respond only with the rewritten text — do not include explanations or comments.`,
        },
        {
          role: 'user',
          content: `
            "${dto.text}" translated into "${dto.targetLanguage}"
          `,
        },
      ],
    });

    return {
      text: response.choices[0].message.content || '',
      lang: dto.targetLanguage,
    };
  }
}
