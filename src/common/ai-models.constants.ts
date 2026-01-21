export enum AIProvider {
  OPENAI = 'openai',
}

export const AI_MODELS = {
  [AIProvider.OPENAI]: [
    'gpt-4o-mini',
  ],
};

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
