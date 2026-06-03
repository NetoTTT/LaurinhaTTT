import OpenAI from 'openai';
import { config } from '../config';

export type AIProvider = 'lmstudio' | 'opencode-go';

export interface AIProviderConfig {
  provider: AIProvider;
  client: OpenAI;
  model: string;
}

function createLMStudioClient(): AIProviderConfig {
  const client = new OpenAI({
    baseURL: config.lmStudio.url,
    apiKey: 'lm-studio',
  });
  return { provider: 'lmstudio', client, model: config.lmStudio.model };
}

function createOpenCodeGoClient(): AIProviderConfig {
  const client = new OpenAI({
    baseURL: config.openCodeGo.url,
    apiKey: config.openCodeGo.apiKey,
  });
  return { provider: 'opencode-go', client, model: config.openCodeGo.model };
}

export function getActiveProvider(): AIProviderConfig {
  const provider = process.env.AI_PROVIDER ?? 'opencode-go';

  if (provider === 'lmstudio') {
    return createLMStudioClient();
  }

  return createOpenCodeGoClient();
}

export function getAllProviders(): { primary: AIProviderConfig; fallback: AIProviderConfig | null } {
  const primary = getActiveProvider();

  const fallbackProvider = primary.provider === 'lmstudio' ? 'opencode-go' : 'lmstudio';

  if (fallbackProvider === 'opencode-go' && config.openCodeGo.apiKey) {
    return { primary, fallback: createOpenCodeGoClient() };
  }
  if (fallbackProvider === 'lmstudio') {
    return { primary, fallback: createLMStudioClient() };
  }

  return { primary, fallback: null };
}
