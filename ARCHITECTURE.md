# TTT Platform — Arquitetura e Planejamento

> Projeto novo, separado do TTT-Codex (bot Discord legado).  
> Foco inicial: WhatsApp. Arquitetura desenhada para suportar Discord, Telegram e outros no futuro.

---

## 1. Visão Geral

O problema do projeto antigo era **acoplamento**: WhatsApp, lógica de negócio e IA viviam no mesmo processo. Se o WhatsApp desconectava, tudo ia junto.

A solução é separar **adaptadores de plataforma** do **núcleo da aplicação** via um barramento de mensagens. Cada serviço pode reiniciar, escalar ou ser substituído independentemente.

```
┌─────────────────────────────────────────────────────────────────┐
│                        TTT PLATFORM                             │
│                                                                 │
│  ┌─────────────────┐          ┌─────────────────────────────┐  │
│  │ WhatsApp        │          │ Discord Adapter             │  │
│  │ Adapter         │          │ (microservice leve)         │  │
│  │                 │          │                             │  │
│  │ Evolution API   │          │ discord.js + gateway        │  │
│  │ (Docker próprio)│          │ (Docker ou processo PM2)    │  │
│  └────────┬────────┘          └──────────────┬──────────────┘  │
│           │  webhook/REST                    │ evento→REST      │
│           └──────────────────┬───────────────┘                 │
│                              │                                  │
│                   ┌──────────▼──────────┐                       │
│                   │    Message Bus       │                       │
│                   │  Redis Pub/Sub       │                       │
│                   │  (ou NATS no futuro) │                       │
│                   └──────────┬──────────┘                       │
│                              │                                  │
│                   ┌──────────▼──────────┐                       │
│                   │   Core Backend       │                       │
│                   │   (Orquestrador)     │                       │
│                   │                     │                       │
│                   │  • Command Router    │                       │
│                   │  • AI Engine         │                       │
│                   │  • Media Processor   │                       │
│                   │  • Sticker Service   │                       │
│                   │  • Business Logic    │                       │
│                   │  • [futuro] MCP      │                       │
│                   └──────────┬──────────┘                       │
│                              │                                  │
│                   ┌──────────▼──────────┐                       │
│                   │   Infraestrutura     │                       │
│                   │  PostgreSQL | Redis  │                       │
│                   │  MinIO (mídia)       │                       │
│                   └─────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Serviços

### 2.1 Core Backend (Orquestrador)
O cérebro da plataforma. Não conhece WhatsApp nem Discord — só conhece "mensagens" e "respostas".

**Responsabilidades:**
- Receber eventos normalizados do barramento (`message.received`, `reaction.added`, etc.)
- Rotear para o handler correto (comando, AI, mídia)
- Processar e publicar a resposta de volta no barramento
- Gerenciar estado, sessões de usuário e configurações

**Stack sugerida:** Node.js + TypeScript + Fastify  
**Por quê Fastify?** Mais rápido que Express, ótimo para APIs REST internas, suporte nativo a schemas JSON.

**Módulos internos:**
```
core-backend/
├── src/
│   ├── router/          # Roteador de comandos/intenções
│   ├── ai/              # Integração Claude/OpenAI (futuro MCP)
│   ├── media/           # Processamento de mídia (stickers, imagens)
│   ├── platform/        # Adaptadores de normalização de mensagem
│   ├── handlers/        # Lógica de negócio por domínio
│   ├── bus/             # Publisher/Subscriber do Redis
│   └── db/              # PostgreSQL (Drizzle ORM ou pg direto)
```

---

### 2.2 WhatsApp Adapter

**Decisão: Evolution API** ✅

| Critério | Evolution API | WhatsApp Web.js | Baileys (direto) |
|---|---|---|---|
| Desacoplamento | ✅ REST + webhook | ❌ biblioteca acoplada | ⚠️ acoplado ao código |
| Reconexão automática | ✅ interno | ❌ manual | ❌ manual |
| Sem browser (Puppeteer) | ✅ | ❌ pesado | ✅ |
| Reiniciar sem afetar backend | ✅ | ❌ | ❌ |
| Multi-instância | ✅ nativo | ❌ | ⚠️ manual |
| Stickers, mídia, reações | ✅ | ✅ | ✅ |
| Manutenção ativa | ✅ | ⚠️ lento | ✅ |
| Auto-hospedagem gratuita | ✅ | ✅ | ✅ |

**Por que Evolution API resolve o problema do projeto antigo:**  
A Evolution API roda como um container Docker completamente separado. Ela cuida da conexão com o WhatsApp internamente — se cair, ela mesma reconecta. Seu backend recebe os eventos via **webhook** e envia respostas via **REST API**. Você pode reiniciar a Evolution sem tocar no backend, e vice-versa.

**Como funciona:**
```
WhatsApp ←→ Evolution API (Docker) ←→ webhook → WhatsApp Adapter → Redis → Core Backend
                                    ←→ REST API ← WhatsApp Adapter ← Redis ← Core Backend
```

**O WhatsApp Adapter** é um microserviço fino que:
- Recebe webhooks da Evolution API
- Normaliza a mensagem para o formato interno da plataforma
- Publica no Redis
- Escuta o Redis por respostas e chama a Evolution API REST para enviar

```
whatsapp-adapter/
├── src/
│   ├── webhook/         # Recebe eventos da Evolution API
│   ├── normalizer/      # WhatsApp → formato interno
│   ├── sender/          # Formato interno → Evolution API REST
│   └── bus/             # Redis pub/sub
```

---

### 2.3 Discord Adapter

Bot Discord leve — apenas traduz eventos Discord ↔ formato interno da plataforma.

**Stack:** Node.js + TypeScript + discord.js v14  
**Deploy:** Docker container leve (≈50MB RAM)

```
discord-adapter/
├── src/
│   ├── events/          # Eventos Discord → formato interno
│   ├── normalizer/      # Discord → formato interno
│   ├── sender/          # Formato interno → Discord API
│   └── bus/             # Redis pub/sub
```

---

### 2.4 Message Bus — Redis Pub/Sub

Todos os adaptadores se comunicam com o Core via Redis. Isso garante:
- Zero acoplamento entre serviços
- Qualquer adaptador pode reiniciar sem perder mensagens (com Redis Streams no futuro)
- Fácil adição de novos adaptadores (Telegram, Slack, etc.)

**Tópicos principais:**
```
platform.message.inbound   ← adaptadores publicam mensagens recebidas
platform.message.outbound  ← core publica respostas
platform.events            ← eventos internos (sessão, erro, reconexão)
```

**Formato normalizado de mensagem:**
```typescript
interface PlatformMessage {
  id: string;
  platform: 'whatsapp' | 'discord' | 'telegram';
  chatId: string;
  userId: string;
  userName: string;
  content: {
    type: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document';
    text?: string;
    media?: { url: string; mimetype: string; caption?: string };
  };
  replyTo?: string;
  timestamp: number;
  raw?: unknown; // payload original da plataforma
}
```

---

## 3. Sticker Service (foco inicial)

Roda dentro do Core Backend como módulo, mas pode virar microserviço separado se o processamento ficar pesado.

**Funcionalidades planejadas:**
- Sticker de imagem estática (WebP)
- Sticker animado (WebP animado a partir de GIF/MP4)
- Sticker de música (capa do álbum + waveform animada)
- Sticker com texto (overlay em imagem)

**Stack de processamento:**
- `sharp` — redimensionamento e conversão para WebP
- `ffmpeg` — conversão de vídeo/GIF para WebP animado
- `canvas` / `@napi-rs/canvas` — geração de stickers com texto/waveform

**Fluxo:**
```
Usuário envia imagem + comando "sticker"
  → WhatsApp Adapter normaliza
  → Redis inbound
  → Core Backend roteia para Sticker Service
  → Processa (sharp/ffmpeg)
  → Publica resposta no Redis outbound com mídia em base64 ou URL MinIO
  → WhatsApp Adapter envia via Evolution API
```

---

## 4. Infraestrutura

### docker-compose.yml (visão geral)
```yaml
services:
  evolution-api:      # WhatsApp — porta 8080
  whatsapp-adapter:   # Microserviço adaptador WA
  discord-adapter:    # Microserviço adaptador Discord
  core-backend:       # Orquestrador central
  postgres:           # Banco principal
  redis:              # Message bus + cache
  minio:              # Armazenamento de mídia (opcional, fase 2)
```

Cada serviço tem seu próprio `Dockerfile`. O `docker-compose.yml` na raiz orquestra tudo.  
Em produção, cada serviço pode ir para um container/VM separado sem mudança de código.

---

## 5. Estrutura de Repositório

**Monorepo** (recomendado para começar):
```
ttt-platform/
├── services/
│   ├── core-backend/         # Orquestrador principal
│   ├── whatsapp-adapter/     # Adaptador Evolution API
│   └── discord-adapter/      # Adaptador Discord
├── packages/
│   └── shared-types/         # Tipos TypeScript compartilhados (PlatformMessage, etc.)
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── evolution/            # Config da Evolution API
├── docs/
│   └── ARCHITECTURE.md       # Este documento
└── package.json              # Workspace root (npm workspaces ou pnpm)
```

**Por que monorepo?** Com 3 serviços TypeScript pequenos, monorepo evita triplicar configuração de TS/ESLint/tipos. Quando crescer, é fácil extrair para repos separados.

---

## 6. Roadmap de Implementação

### Fase 1 — Fundação (WhatsApp funcional)
- [ ] Setup monorepo + shared-types
- [ ] Subir Evolution API via Docker
- [ ] Implementar whatsapp-adapter (webhook → Redis → REST)
- [ ] Core Backend com roteador básico de comandos
- [ ] Sticker de imagem estática funcional no WhatsApp
- [ ] PostgreSQL com schema básico (usuários, sessões)

### Fase 2 — Stickers completos
- [ ] Sticker animado (GIF/MP4 → WebP)
- [ ] Sticker de música (capa + waveform)
- [ ] Sticker com texto/overlay
- [ ] MinIO para armazenar mídias processadas

### Fase 3 — Discord
- [ ] Discord Adapter
- [ ] Comandos slash via Core Backend
- [ ] Paridade de features com WhatsApp

### Fase 4 — IA + MCP
- [ ] Integração Claude API no Core Backend
- [ ] Servidor MCP para tools (busca, dados do jogo Rucoy, etc.)
- [ ] Contexto de conversa persistido no PostgreSQL

### Fase 5 — Produção
- [ ] Health checks em todos os serviços
- [ ] Redis Streams (mensagens com garantia de entrega)
- [ ] Observabilidade (logs estruturados, métricas)
- [ ] CI/CD pipeline

---

## 7. Decisões Técnicas Registradas

| Decisão | Escolha | Alternativas consideradas | Razão |
|---|---|---|---|
| WhatsApp API | Evolution API | WWeb.js, Baileys | Desacoplamento total, reconexão automática interna |
| Message Bus | Redis Pub/Sub | NATS, RabbitMQ | Já é necessário para cache, zero infra extra |
| ORM | Drizzle ORM | Prisma, pg direto | TypeScript-first, sem geração de código, leve |
| Estrutura | Monorepo | Multi-repo | 3 serviços pequenos, tipos compartilhados |
| Media store | MinIO (fase 2) | S3, Cloudflare R2 | Auto-hospedado, API S3-compatível |
| HTTP Framework | Fastify | Express, Hono | Performance, schemas nativos, TypeScript |

---

## 8. Considerações de Segurança

- Evolution API deve ficar em rede Docker interna, sem exposição pública direta
- WhatsApp Adapter autentica webhooks via secret header da Evolution
- Core Backend não é exposto publicamente (apenas via adaptadores)
- Tokens e secrets via variáveis de ambiente, nunca em código
- Rate limiting no whatsapp-adapter para evitar ban do WhatsApp

---

*Documento criado em 2026-05-29 — atualizar conforme o projeto evolui.*
