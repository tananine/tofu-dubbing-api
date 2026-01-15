export enum AIProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
}

export const AI_MODELS = {
  [AIProvider.OPENAI]: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ],
  [AIProvider.CLAUDE]: [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  [AIProvider.GEMINI]: [
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
};

type AIModel =
  | (typeof AI_MODELS)[AIProvider.OPENAI][number]
  | (typeof AI_MODELS)[AIProvider.CLAUDE][number]
  | (typeof AI_MODELS)[AIProvider.GEMINI][number];

export function getAIProvider(model: string): AIProvider | null {
  for (const [provider, models] of Object.entries(AI_MODELS)) {
    if ((models as readonly string[]).includes(model)) {
      return provider as AIProvider;
    }
  }
  return null;
}

export function isAIModel(model: string): boolean {
  return getAIProvider(model) !== null;
}
