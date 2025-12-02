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
            You are an expert translator and text stylist. Rewrite the source text "${dto.text}" according to the user's request. 
              - If a target language (${dto.targetLanguage}) is provided, translate and rewrite it to sound natural, clear, and smooth while preserving the original meaning and tone.
              - If no target language is provided, simply refine the original text to make it easier to understand without changing the meaning.
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
