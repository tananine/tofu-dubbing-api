import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AIProvider } from '../common/ai-models.constants.js';

export interface TranslateTextParams {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  model: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
}

export interface TranslateTextResult {
  text: string;
  usage: TokenUsage;
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
  ): Promise<TranslateTextResult> {
    switch (provider) {
      case AIProvider.OPENAI:
        return this.translateWithOpenAI(params);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private async translateWithOpenAI(
    params: TranslateTextParams,
  ): Promise<TranslateTextResult> {
    const { text, fromLanguage, toLanguage, model } = params;

    const systemPrompt = `You are a professional translator. Translate the given text from ${fromLanguage} to ${toLanguage}. 
Only return the translated text without any additional explanations, quotes, or formatting.`;

    const response = await this.openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    });

    const translatedText = response.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error('No translation received from OpenAI');
    }

    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cachedTokens:
        (response.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
    };

    return { text: translatedText, usage };
  }
}
