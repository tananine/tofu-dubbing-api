import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AIProvider } from '../common/ai-models.constants.js';

export interface TranslateTextParams {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  model: string;
}

@Injectable()
export class TranslationService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async translateText(
    params: TranslateTextParams,
    provider: AIProvider,
  ): Promise<string> {
    switch (provider) {
      case AIProvider.OPENAI:
        return this.translateWithOpenAI(params);
      case AIProvider.CLAUDE:
        return this.translateWithClaude(params);
      case AIProvider.GEMINI:
        return this.translateWithGemini(params);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private async translateWithOpenAI(
    params: TranslateTextParams,
  ): Promise<string> {
    const { text, fromLanguage, toLanguage, model } = params;

    const systemPrompt = `You are a professional translator. Translate the given text from ${fromLanguage} to ${toLanguage}. 
Only return the translated text without any additional explanations, quotes, or formatting.`;

    const userPrompt = text;

    const response = await this.openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });

    const translatedText = response.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error('No translation received from OpenAI');
    }

    return translatedText;
  }

  private async translateWithClaude(
    params: TranslateTextParams,
  ): Promise<string> {
    throw new Error('Claude translation not yet implemented');
  }

  private async translateWithGemini(
    params: TranslateTextParams,
  ): Promise<string> {
    throw new Error('Gemini translation not yet implemented');
  }
}
