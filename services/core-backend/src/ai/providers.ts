import OpenAI from 'openai';
import { config } from '../config';

export type AIProvider = 'lmstudio' | 'opencode-go';

export interface AIProviderConfig {
  provider: AIProvider;
  client: OpenAI;
  model: string;
}

// Provider ativo em runtime — começa com o valor do env, pode ser trocado sem restart
let activeProvider: AIProvider = (process.env.AI_PROVIDER as AIProvider) ?? 'opencode-go';

// Semáforo para LM Studio — só 1 request por vez (modelo local não suporta concorrência)
let lmStudioBusy = false;
const lmStudioQueue: Array<() => void> = [];

export async function acquireLMStudio(): Promise<void> {
  if (!lmStudioBusy) {
    lmStudioBusy = true;
    return;
  }
  return new Promise(resolve => lmStudioQueue.push(resolve));
}

export function releaseLMStudio(): void {
  const next = lmStudioQueue.shift();
  if (next) next();
  else lmStudioBusy = false;
}

export function setActiveProvider(provider: AIProvider): void {
  activeProvider = provider;
  console.log(`[providers] switched to: ${provider}`);
}

export function getActiveProviderName(): AIProvider {
  return activeProvider;
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
    timeout: 120_000, // 2 minutos — suporta respostas longas
  });
  return { provider: 'opencode-go', client, model: config.openCodeGo.model };
}

export function getActiveProvider(): AIProviderConfig {
  if (activeProvider === 'lmstudio') return createLMStudioClient();
  return createOpenCodeGoClient();
}

export function getAllProviders(): { primary: AIProviderConfig; fallback: AIProviderConfig | null } {
  const primary = getActiveProvider();

  // Fallback: se primário for opencode-go, usa LM Studio só se explicitamente habilitado
  // Se primário for LM Studio, fallback é opencode-go
  if (primary.provider === 'lmstudio' && config.openCodeGo.apiKey) {
    return { primary, fallback: createOpenCodeGoClient() };
  }

  // opencode-go como primário — sem fallback pro LM Studio (evita sobrecarga do modelo local)
  return { primary, fallback: null };
}
