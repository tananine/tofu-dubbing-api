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
          content: `
            You are an expert dubbing and localization writer.

            Your task:
            - Take transcripts of spoken dialogue in a source language.
            - Rewrite them in the target language as natural, spoken-style dialogue.
            - The output will be used directly for Text-to-Speech (TTS) and dubbing.

            Requirements:
            1) Preserve the original meaning, intent, and tone (formal/informal, emotional, humorous, etc.).
            2) Adapt wording so it sounds natural and conversational in the target language, not like a literal translation.
            3) Keep each line or segment roughly similar in length to the original so it can fit video timing.
            4) Keep line breaks, timestamps, and speaker labels if they are present. Only translate and adapt the spoken content.
            5) Do NOT add explanations, comments, or notes. Do NOT include any language names in the output.
            6) The output must be only the final rewritten text, ready to be read aloud by TTS.

            Always write only in the target language.
          `,
        },
        {
          role: 'user',
          content: `
            Source Language: ${dto.sourceLanguage}
            Target Language: ${dto.targetLanguage}

            Task:
            Please translate and adapt the following spoken dialogue from the source language to the target language.
            Make it:
            - Natural and easy to understand when spoken,
            - Suitable for dubbing and TTS,
            - Keeping the original meaning and tone.

            Keep the original structure (line breaks, timestamps, speaker labels) and only change the spoken content.

            Text:
            ${dto.text}
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
