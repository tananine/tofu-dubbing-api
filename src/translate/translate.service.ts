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
          content: `You are a translator. Translate the following text from ${dto.sourceLanguage} to ${dto.targetLanguage}. Only respond with the translated text, nothing else.`,
        },
        {
          role: 'user',
          content: dto.text,
        },
      ],
    });

    return {
      text: response.choices[0].message.content || '',
      lang: dto.targetLanguage,
    };
  }
}
