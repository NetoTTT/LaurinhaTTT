# Laurinha TTT

Assistente inteligente multiplataforma com IA, criadora de sites e figurinhas — tudo via WhatsApp e Discord.

---

## Visao Geral

A **Laurinha TTT** e uma plataforma de assistente pessoal com inteligencia artificial que opera em multiplas plataformas de mensageria (WhatsApp e Discord). Ela nao apenas conversa, mas tambem:

- **Cria figurinhas** personalizadas a partir de imagens
- **Gera sites completos** (HTML/CSS/JS) sob demanda
- **Cria backends** com Node.js + Express
- **Memoriza** informacoes sobre cada usuario
- **Envia audios** com voz sintetica
- **Agenda mensagens** para enviar mais tarde

Arquitetura baseada em microsserviços com barramento Redis, permitindo que cada plataforma opere independentemente.

---

## Arquitetura

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   WhatsApp   │    │   Discord    │    │     (futuro) │
│   Adapter    │    │   Adapter    │    │     Telegram │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────┬───┴───────────────────┘
                       │
              ┌────────▼────────┐
              │   Redis Pub/Sub │  ← barramento de mensagens
              │  (message bus)  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   Core Backend  │  ← orquestrador principal
              │  (Fastify + IA) │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  PostgreSQL     │
              │  + Redis Cache  │
              └─────────────────┘
```

### Serviços

| Serviço | Descrição | Porta |
|---|---|---|
| **core-backend** | Orquestrador principal com motor de IA (OpenAI/OpenCode), processamento de figurinhas, criação de sites, memória por usuário | `3321` |
| **whatsapp-adapter** | Adaptador WhatsApp via `whatsapp-web.js` com QR code, sessão persistente | `3322` |
| **discord-adapter** | Bot Discord (discord.js v14) com comandos `!!` | — (gateway) |
| **api-router** | Gateway dinâmico que roteia `/api/:projeto` para backends criados pela IA | `3872` |
| **pages-server** | Servidor de páginas estáticas (HTML/CSS/JS) criadas pela IA | `3871` |
| **dashboard** | Painel web para monitoramento e administração | `3323` |

---

## Stack

| Categoria | Tecnologia |
|---|---|
| **Linguagem** | TypeScript (Node.js) |
| **Runtime** | Node.js ≥ 18 |
| **IA** | OpenAI API / OpenCode Go / LM Studio (local) |
| **Memória** | Gemini para compactação de memória dos usuários |
| **Database** | PostgreSQL + Redis (cache e message bus) |
| **Processamento** | Sharp (imagens), FFmpeg (áudio/vídeo), Resemble (TTS) |
| **Gerenciamento** | PM2 (produção), Docker Compose (infra) |
| **Monorepo** | npm workspaces |

---

## Estrutura do Repositório

```
LaurinhaTTT/
├── packages/
│   └── shared-types/          # Tipos TypeScript compartilhados
│       └── src/
│           ├── messages.ts    # PlatformMessage, PlatformResponse
│           └── bus.ts         # Tipos do barramento Redis
│
├── services/
│   ├── core-backend/          # Orquestrador principal
│   │   └── src/
│   │       ├── ai/            # Motor de IA (system prompt, tools, code-tools)
│   │       ├── bus/           # Pub/Sub Redis
│   │       ├── config/        # Configuração por ambiente
│   │       ├── db/            # PostgreSQL (repositórios)
│   │       ├── handlers/      # Comandos (!!sticker, !!la, etc.)
│   │       ├── media/         # Processamento de figurinhas, TTS
│   │       ├── memory/        # Sistema de memória por usuário
│   │       └── router/        # Roteador de comandos
│   │
│   ├── whatsapp-adapter/      # Adaptador WhatsApp
│   │   └── src/
│   │       ├── webhook/       # Recebe eventos da Evolution API
│   │       ├── normalizer/    # Normalização de mensagens
│   │       ├── sender/        # Envio de respostas
│   │       └── bus/           # Redis pub/sub
│   │
│   ├── discord-adapter/       # Bot Discord
│   │   └── src/
│   │       ├── discord/       # Cliente discord.js
│   │       ├── normalizer/    # Normalização de mensagens
│   │       └── bus/           # Redis pub/sub
│   │
│   ├── api-router/            # Gateway de backends da IA
│   └── dashboard/             # Painel web de admin
│
├── infra/
│   ├── docker-compose.yml     # Infra completa
│   ├── docker-compose.dev.yml # Dev com hot-reload
│   └── docker-compose-infra.yml  # Apenas Redis + PostgreSQL
│
├── docs/
│   ├── ARCHITECTURE.md        # Arquitetura detalhada
│   ├── COMMANDS.md            # Comandos disponíveis
│   ├── MEMORY_DESIGN.md       # Design do sistema de memória
│   ├── PROMPT_DESIGN.md       # Design do system prompt
│   └── PLANO-IA-CODIGO.md     # Plano de IA como desenvolvedora
│
├── ecosystem.config.js        # Config PM2 (produção)
├── ecosystem.config.example.js
├── pages-server.mjs           # Servidor de páginas estáticas
├── tsconfig.base.json         # Base TS para todos os serviços
└── xingamentos.txt            # Palavras de contexto extra para a IA
```

---

## Começando

### Pré-requisitos

- Node.js ≥ 18
- Docker & Docker Compose
- Uma chave de API OpenAI ou OpenCode Go
- (opcional) Chromium — para `whatsapp-web.js`

### 1. Suba a infraestrutura

```bash
npm run infra:up
```

Isso sobe PostgreSQL e Redis via Docker.

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas chaves
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Inicie em modo dev

```bash
npm run dev
```

Isso inicia `core-backend` e `whatsapp-adapter` com hot-reload via `ts-node-dev`.

### 5. Escaneie o QR Code

O WhatsApp adapter exibirá um QR code no terminal. Escaneie com o WhatsApp do seu celular (Configurações → Dispositivos conectados).

---

## Comandos Principais

Todos os comandos começam com `!!` (dois pontos de exclamação).

| Comando | Descrição |
|---|---|
| `!!la <mensagem>` | Chama a IA Laura para conversar |
| `!!sticker` | Converte imagem em figurinha WebP |
| `!!dev on/off` | Ativa/desativa modo desenvolvedor (IA cria backends) |
| `!!ping` | Teste de conectividade |

> Consulte [COMMANDS.md](./COMMANDS.md) para a lista completa.

---

## Funcionalidades Principais

### IA com Memoria

Cada usuario tem um arquivo de memoria persistido em `data/memory/`. A Laura lembra de preferencias, fatos e contexto das conversas. A compactacao e feita pelo Gemini para manter apenas o relevante.

### Criacao de Sites

A Laura pode criar sites completos via comando natural. Exemplo:
> "Laura, cria um site pra minha loja de brigadeiros"

Ela gera HTML/CSS/JS, publica em `laurinha.asktome.com.br` e retorna o link.

### Backends com Node.js

Com o modo dev ativado (`!!dev on`), a Laura tambem cria APIs completas com Node.js + Express, incluindo banco de dados persistente. Os backends ficam disponiveis em `laurinha.asktome.com.br/api/:projeto`.

### Figurinhas

Converte imagens em figurinhas WebP para WhatsApp, com suporte a ensino de figurinhas (a IA aprende qual figurinha usar em cada contexto).

---

## Produção

Em produção, os serviços são gerenciados pelo PM2:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar todos os serviços
pm2 start ecosystem.config.js

# Ver status
pm2 status

# Ver logs
pm2 logs
```

---

## Documentação

- [Arquitetura](./ARCHITECTURE.md) — Decisões técnicas e diagramas
- [Comandos](./COMMANDS.md) — Lista de comandos disponíveis
- [Memória](./MEMORY_DESIGN.md) — Sistema de memória por usuário
- [Prompt](./PROMPT_DESIGN.md) — Design do system prompt da IA
- [Plano Código](./PLANO-IA-CODIGO.md) — Como a IA cria código

---

## Licença

Projeto privado — todos os direitos reservados.
