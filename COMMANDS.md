# Laurinha TTT — Comandos

Todos os comandos começam com `!!` (dois pontos de exclamação). Qualquer outro prefixo (`!`, `!!!`, etc) será ignorado.

## Sintaxe

```
!!comando [argumentos]
```

Se o comando for desconhecido, será ignorado silenciosamente (sem resposta).

## Comandos Disponíveis

### `!!ping`

Comando de teste simples.

**Uso:**
```
!!ping
```

**Resposta:**
```
pong! 🏓
```

---

### `!!sticker`

Converte uma imagem em sticker WebP.

**Formas de uso:**

1. **Com imagem na mesma mensagem:**
   - Envie uma imagem com legenda `!!sticker`

2. **Respondendo uma imagem:**
   - Responda uma mensagem que contém imagem com `!!sticker`

**Exemplo:**
```
User: [envia imagem com texto "!!sticker"]
Bot: [retorna sticker WebP]

---

User: [responde a uma imagem com "!!sticker"]
Bot: [retorna sticker WebP]
```

**Erro:**
Se não houver imagem anexada ou respondida:
```
Manda uma imagem junto com o comando ou responde uma imagem com !!sticker 🎨
```

---

## Ignorando Comandos Inválidos

Se você usar:
- `!comando` (um ponto)
- `!!!comando` (três pontos)
- `!!!!comando` (quatro ou mais)
- `!!comandoInvalido` (comando não existente)

O bot **ignorará completamente** e não responderá nada.

---

## Adicionando Novos Comandos

Novos comandos são adicionados em:
1. `services/core-backend/src/handlers/<comando>.handler.ts` — Lógica do comando
2. `services/core-backend/src/router/command.router.ts` — Registrar no switch

Exemplo de novo handler:

```typescript
// services/core-backend/src/handlers/hello.handler.ts
import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';

export async function handleHelloCommand(message: PlatformMessage): Promise<PlatformResponse> {
  return {
    chatId: message.chatId,
    platform: message.platform,
    replyTo: message.id,
    content: { type: 'text', text: `Oi ${message.userName}! 👋` },
  };
}
```

Depois registrar no router:

```typescript
// services/core-backend/src/router/command.router.ts
import { handleHelloCommand } from '../handlers/hello.handler';

// No switch:
case 'hello':
  return handleHelloCommand(message);
```
