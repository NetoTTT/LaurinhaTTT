import 'dotenv/config';

export const config = {
  port: parseInt(process.env.CORE_PORT ?? '3321'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/laurinha',
  ownerNumber: process.env.OWNER_NUMBER ?? '557583439297',
  lmStudio: {
    url: process.env.LM_STUDIO_URL ?? 'http://100.71.223.57:1234/v1',
    model: process.env.LM_STUDIO_MODEL ?? 'gemma-4-e2b-it',
  },

  openCodeGo: {
    url: process.env.OPENCODE_GO_URL ?? 'https://opencode.ai/zen/go/v1',
    apiKey: process.env.OPENCODE_GO_API_KEY ?? '',
    model: process.env.OPENCODE_GO_MODEL ?? 'opencode-go/deepseek-v4-flash',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite',
  },
  memoryPath: process.env.MEMORY_PATH ?? '/home/lourival/Documentos/LaurinhaTTT/services/core-backend/data/memory',
  xingamentosPath: process.env.XINGAMENTOS_PATH ?? '/home/lourival/Documentos/LaurinhaTTT/xingamentos.txt',
  braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? '',
  evolution: {
    url: process.env.EVOLUTION_API_URL ?? 'http://localhost:8090',
    apiKey: process.env.EVOLUTION_API_KEY ?? '',
    instance: process.env.EVOLUTION_INSTANCE ?? 'laurinha',
  },
};
