import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { handleStickerCommand } from '../handlers/sticker.handler';
import { handlePingCommand } from '../handlers/ping.handler';
import { handleAIMessage } from '../handlers/ai.handler';
import { handleClearCommand } from '../handlers/clear.handler';
import { isAIMessage } from '../ai/message-tracker';
import { setActiveProvider, getActiveProviderName, type AIProvider } from '../ai/providers';
import { pageCreateCooldowns, pageUpdateCooldowns, userPageSlug, saveUserSlugs } from '../ai/tools';
import { isDevModeActive, setDevMode } from '../ai/dev-mode';
import { config } from '../config';

const AI_COMMANDS = new Set(['laura', 'laurinha', 'la', 'lara']);

// Cache de mensagens enviadas pela IA para evitar loops
// Map<messageId, timestamp>
const recentAISentMessages = new Map<string, number>();
const CACHE_TTL = 5000; // 5 segundos

function trackSentMessage(messageId: string): void {
  recentAISentMessages.set(messageId, Date.now());
  // Limpar após TTL
  setTimeout(() => recentAISentMessages.delete(messageId), CACHE_TTL);
}

function wasRecentlySentByAI(messageId: string): boolean {
  const timestamp = recentAISentMessages.get(messageId);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
}

export { trackSentMessage };

export async function routeMessage(message: PlatformMessage): Promise<PlatformResponse | null> {
  const text = message.content.text?.trim() ?? '';
  const lower = text.toLowerCase();

  // Verifica se é resposta a mensagem da IA (sem prefixo !!)
  // IMPORTANTE: Apenas para usuários comuns, não para o owner
  // (O owner pode usar !! se quiser respostas automáticas)
  const isOwner = message.userName === 'Owner';
  if (message.quotedMessage && !isOwner) {
    console.log(`[auto-reply] checking if replied to AI: ${message.quotedMessage.id}`);

    // Evitar loops: não processar se a mensagem respondida foi enviada pela IA recentemente
    if (wasRecentlySentByAI(message.quotedMessage.id)) {
      console.log(`[auto-reply] ⚠️  ignoring reply to AI message sent recently (loop protection)`);
      return null;
    }

    const isReplyToAI = await isAIMessage(message.platform, message.quotedMessage.id);
    console.log(`[auto-reply] isReplyToAI=${isReplyToAI}`);
    if (isReplyToAI) {
      console.log(`[auto-reply] ✓ detected reply to AI message from ${message.userName}`);
      return handleAIMessage(message);
    }
  }

  if (lower.startsWith('!!')) {
    const name = lower.slice(2).trim().split(/\s+/)[0];
    // Log detalhado para diagnóstico de identidade
    console.log(`[command] !! "${name}" | userName="${message.userName}" | userId="${message.userId}" | chatId="${message.chatId}" | isGroup=${message.isGroup} | isOwner(userName)=${message.userName === 'Owner'} | isOwner(platformId)=${message.userId === config.ownerPlatformId} | expectedOwnerPlatformId="${config.ownerPlatformId}"`);

    if (AI_COMMANDS.has(name)) {
      const aiText = text.slice(2 + name.length).trim();
      const aiMessage: PlatformMessage = {
        ...message,
        content: { ...message.content, type: 'text', text: aiText || '👋' },
      };
      return handleAIMessage(aiMessage);
    }

    switch (name) {
      case 'sticker':
        return handleStickerCommand(message);
      case 'ping':
        return handlePingCommand(message);
      case 'clear':
        return handleClearCommand(message);
      case 'ia': {
        const arg = lower.slice(2 + name.length).trim();
        const PROVIDER_ALIASES: Record<string, AIProvider> = {
          lm: 'lmstudio', lmstudio: 'lmstudio', local: 'lmstudio',
          opencode: 'opencode-go', oc: 'opencode-go', cloud: 'opencode-go',
        };
        // Switch de provider — só owner, só quando arg é lm/opencode/etc
        if (isOwner && arg in PROVIDER_ALIASES) {
          setActiveProvider(PROVIDER_ALIASES[arg]);
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: `IA: ${PROVIDER_ALIASES[arg]}` } };
        }
        if (isOwner && !arg) {
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: `IA atual: ${getActiveProviderName()}\nUso: !!ia lm | !!ia opencode` } };
        }
        // Qualquer outro texto → encaminha pra IA (alias de !!la)
        const aiMessage: PlatformMessage = {
          ...message,
          content: { ...message.content, type: 'text', text: arg || '👋' },
        };
        return handleAIMessage(aiMessage);
      }
      case 'sites': {
        if (!isOwner) return null;
        const { readdirSync, existsSync: fsExists } = await import('fs');
        const { join } = await import('path');
        const { config } = await import('../config');
        const dir = config.pagesDir;
        if (!fsExists(dir)) {
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: 'Nenhum site criado ainda.' } };
        }
        const files = readdirSync(dir).filter(f => f.endsWith('.html'));
        if (!files.length) {
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: 'Nenhum site criado ainda.' } };
        }
        // Monta lista com dono se souber
        const slugToUser = new Map(Array.from(userPageSlug.entries()).map(([u, s]) => [s, u.replace('@c.us', '')]));
        const lines = files.map(f => {
          const slug = f.replace('.html', '');
          const owner = slugToUser.get(slug);
          return `${config.pagesBaseUrl}/${slug}${owner ? ` (${owner})` : ''}`;
        });
        return {
          chatId: message.chatId,
          platform: message.platform,
          content: { type: 'text', text: `Sites criados (${files.length}):\n${lines.join('\n')}` },
        };
      }
      case 'dev': {
        if (!isOwner) return null;
        const devArg = text.slice(2 + name.length).trim().toLowerCase();
        if (devArg === 'on') {
          setDevMode(true);
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: 'modo dev ativado — code tools habilitados' } };
        }
        if (devArg === 'off') {
          setDevMode(false);
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: 'modo dev desativado' } };
        }
        // Status: lista projetos
        const { readdirSync: rds, statSync: sts } = await import('fs');
        const { join: pjoin } = await import('path');
        const { config: cfg } = await import('../config');
        let projects: string[] = [];
        try {
          projects = rds(cfg.projectsDir).filter(f => {
            try { return sts(pjoin(cfg.projectsDir, f)).isDirectory(); } catch { return false; }
          });
        } catch { /* dir ainda não existe */ }
        return {
          chatId: message.chatId, platform: message.platform,
          content: { type: 'text', text: `dev: ${isDevModeActive() ? 'ON' : 'OFF'}\nprojetos: ${projects.length ? projects.join(', ') : 'nenhum'}\n!!dev on | !!dev off` },
        };
      }
      case 'resetsite': {
        if (!isOwner) return null;
        // Aceita menção (@contato) ou número direto
        let targetId: string | null = null;

        if (message.mentionedIds?.length) {
          // Normaliza @lid → @c.us e garante formato correto
          const raw = message.mentionedIds[0];
          const number = raw.replace(/@.*$/, '');
          targetId = `${number}@c.us`;
        } else {
          const arg = text.slice(2 + name.length).trim();
          const number = arg.replace(/\D/g, '');
          if (number) targetId = `${number}@c.us`;
        }

        if (!targetId) {
          return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: 'Uso: !!resetsite @pessoa ou !!resetsite 5511999999999' } };
        }

        pageCreateCooldowns.delete(targetId);
        pageUpdateCooldowns.delete(targetId);
        userPageSlug.delete(targetId);
        saveUserSlugs();
        console.log(`[resetsite] cooldowns resetados para ${targetId}`);
        const display = targetId.replace('@c.us', '');
        return { chatId: message.chatId, platform: message.platform, content: { type: 'text', text: `cooldown resetado: ${display}` } };
      }
      default:
        return null;
    }
  }

  return null;
}
