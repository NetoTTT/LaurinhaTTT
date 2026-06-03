import type { ChatCompletionTool } from 'openai/resources/chat';
import {
  getMemoryForContext,
  writeSection,
  appendNote,
  needsCompaction,
  setPreferredName,
} from './engine';

// ─── Tools expostas ao modelo LM Studio ──────────────────────────────────────
// memory_compact NÃO está aqui — é decisão do backend, não do modelo

export const memoryTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: 'Lê a memória de um usuário. Use no início da conversa para ter contexto sobre ele.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Plataforma (whatsapp)' },
          platform_id: { type: 'string', description: 'ID do usuário na plataforma' },
          display_name: { type: 'string', description: 'Nome de exibição do usuário' },
        },
        required: ['platform', 'platform_id', 'display_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_write_section',
      description:
        'Substitui uma seção da memória do usuário. Use com alta certeza — quando um fato foi confirmado 2 ou mais vezes ou é declarado explicitamente pelo usuário.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          platform_id: { type: 'string' },
          section: {
            type: 'string',
            description: 'Nome da seção: "Perfil", "Como Interagir", "Relacionamentos", "Contexto Atual" ou "Memórias"',
          },
          content: {
            type: 'string',
            description: 'Novo conteúdo completo da seção em markdown (bullets curtos)',
          },
        },
        required: ['platform', 'platform_id', 'section', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_add_note',
      description:
        'Adiciona uma nota rápida à memória do usuário. Use durante a conversa para registrar algo potencialmente importante sem interromper o fluxo.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          platform_id: { type: 'string' },
          note: { type: 'string', description: 'Nota concisa (uma linha)' },
        },
        required: ['platform', 'platform_id', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_set_name',
      description:
        'Registra o nome que este usuário quer usar para chamar a Laura. Use quando o usuário pedir explicitamente para chamá-la por outro nome.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          platform_id: { type: 'string' },
          name: { type: 'string', description: 'Nome preferido (ex: "Lara", "Lu")' },
        },
        required: ['platform', 'platform_id', 'name'],
      },
    },
  },
];

// ─── Execução das tools de memória ───────────────────────────────────────────

export interface MemoryToolResult {
  output: string;
  needsCompaction?: boolean;
}

export async function executeMemoryTool(
  name: string,
  input: Record<string, unknown>,
): Promise<MemoryToolResult> {
  const platform = input.platform as string;
  const platformId = input.platform_id as string;

  switch (name) {
    case 'memory_read': {
      const displayName = (input.display_name as string) ?? platformId;
      const content = await getMemoryForContext(platform, platformId, displayName);
      return { output: content };
    }

    case 'memory_write_section': {
      const section = input.section as string;
      const content = input.content as string;
      await writeSection(platform, platformId, section, content);
      const compact = await needsCompaction(platform, platformId);
      return { output: `Seção "${section}" atualizada.`, needsCompaction: compact };
    }

    case 'memory_add_note': {
      const note = input.note as string;
      const { needsCompaction: compact } = await appendNote(platform, platformId, note);
      return { output: 'Nota adicionada.', needsCompaction: compact };
    }

    case 'memory_set_name': {
      const newName = input.name as string;
      await setPreferredName(platform, platformId, newName);
      return { output: `Nome atualizado para "${newName}".` };
    }

    default:
      return { output: `Tool desconhecida: ${name}` };
  }
}

// ─── Compactação automática — chamada pelo backend, não pelo modelo ───────────

export { compactViaBackend } from './compact';
