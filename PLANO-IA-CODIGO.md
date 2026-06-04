# Laura como Desenvolvedora: Sistema de Código MCP

> Debate de arquitetura entre múltiplas perspectivas de IA.  
> Objetivo: dar à Laura poder para criar, ler, modificar e executar código real —  
> backends Node.js, APIs, lógica de servidor — com a mesma naturalidade que ela já cria páginas HTML.

---

## Contexto atual

```
laurinha.asktome.com.br
  └── Cloudflare Tunnel → localhost:3871 (pages-server.mjs)
        └── /public/pages/*.html   ← estático, gerado pela IA
```

A IA já cria frontend. Falta backend.

**Stack existente:**
- Servidor Linux em 100.114.134.126
- Node.js via nvm, PM2 gerencia processos
- Workspace npm em `/home/lourival/Documentos/LaurinhaTTT/`
- `node_modules` compartilhado na raiz (já existe)
- Redis, PostgreSQL disponíveis

---

## Participantes do Debate

| Voz | Perspectiva |
|-----|-------------|
| **Arquiteta** | Design de sistemas, escalabilidade, modularidade |
| **Pragmática** | Entrega rápida, menos complexidade, funciona hoje |
| **Segurança** | Superfície de ataque, sandboxing, o que pode dar errado |
| **DevEx** | Como a IA vai usar isso na prática, ergonomia dos tools |

---

## Rodada 1 — Como rodar múltiplos backends com um único Node?

### Arquiteta
O projeto já tem `workspaces` no `package.json` raiz. O caminho natural é estender isso: cada projeto da IA vira um workspace em `/projects/nome-do-projeto/`. O Node resolve módulos subindo na árvore de diretórios — se o projeto não tem `node_modules` próprio, cai no raiz. Zero custo de duplicação.

Para execução: um processo `api-router` (Express) que **importa dinamicamente** cada projeto como um sub-roteador. Quando a IA modifica um arquivo, invalida o cache (`delete require.cache[...]`) e recarrega. Um único processo, sem múltiplas portas, sem overhead de PM2 por projeto.

```
/projects/
  ranking-grupo/
    index.js        ← exports express.Router
    data/           ← SQLite, JSON, o que quiser
  jogo-kakau-api/
    index.js
```

```js
// api-router/index.js
app.use('/api/:project', (req, res, next) => {
  const router = loadProject(req.params.project); // cache + hot reload
  router(req, res, next);
});
```

### Pragmática
Concordo com `NODE_PATH` apontando para o `node_modules` raiz — mas hot reload de módulos CommonJS em produção é frágil. Se um projeto trava, derruba o processo inteiro. Minha sugestão: **worker threads por projeto**. Cada projeto roda numa thread isolada com seu próprio contexto de módulo. Comunicação via `MessageChannel`. Reiniciar uma thread é 10ms, não mata os outros.

Mas se isso parecer complexo demais para uma v1 — aceito o dynamic require com try/catch por rota. Pelo menos isola crashes na camada HTTP.

### Segurança
Worker threads não isolam suficientemente. Um `while(true)` num projeto trava a thread e o event loop do pai ainda sente os efeitos. **A separação real seria processos filho** (`child_process.fork`) — mas aí voltamos ao problema de memória.

O ponto mais importante que ninguém mencionou: a IA não pode instalar pacotes arbitrários. `npm install evil-package` pode executar scripts de pós-instalação. Precisamos de uma **allowlist de pacotes** que a IA pode usar — ou pelo menos blocklist de pacotes com lifecycle scripts perigosos.

### DevEx
Do ponto de vista da IA usando os tools: ela não precisa saber como os módulos são isolados. O que importa é:

1. Ela escreve `index.js` num projeto
2. Ela testa via `read_file` se está certo
3. A API fica disponível em `/api/nome-do-projeto/`

O modelo mental deve ser simples: **projeto = pasta = rota**. Qualquer complexidade de isolamento fica invisível nos tools.

### Decisão da Rodada 1
**Escolha: dynamic require + try/catch por rota, com `NODE_PATH` para módulos raiz.**

Razão: v1 precisa funcionar, não ser perfeita. Worker threads entram na v2 se um projeto precisar de isolamento real. O que não pode esperar é o roteamento funcionar.

---

## Rodada 2 — Como a IA lê e escreve código?

### DevEx
Os tools de MCP que a IA precisa são exatamente os que uma IDE usaria:

```
read_file(path)            → string com conteúdo
write_file(path, content)  → cria ou sobrescreve
list_dir(path)             → array de entradas com tipo (file/dir)
delete_file(path)          → remove arquivo
run_project_script(project, script) → executa npm run X no projeto
```

O `path` deve ser **relativo à raiz dos projetos** (`/projects/`). A IA nunca vê o path absoluto — só `ranking-grupo/index.js`, não `/home/lourival/...`.

Diferente do `create_page` (que é fire-and-forget), aqui a IA precisa de **feedback síncrono**: escreve um arquivo, lê de volta pra confirmar, roda um script, vê o output. É um loop de desenvolvimento real.

### Arquiteta
Concordo com os tools, mas adiciono: a IA precisa de um tool `get_project_info(project)` que retorna:
- lista de arquivos
- qual porta o projeto está rodando
- últimos N linhas de log de erro
- se tem erros de sintaxe (rodar `node --check index.js`)

Sem esse feedback, a IA está codando às cegas. Com ele, ela consegue iterar: escreve → verifica → corrige.

### Pragmática
Perigo: a IA vai tentar `write_file('../../services/core-backend/src/ai/lmstudio.ts', ...)` e vai se automodificar. Precisa de path jail **na camada de tool**, não só em documentação.

Também: o output de `run_project_script` precisa ter limite de tamanho (primeiros 2000 chars), timeout (10s) e sanitização. Se a IA rodar `node -e "while(true){}"`, o servidor trava.

### Segurança
Lista completa de restrições necessárias:

**Paths permitidos:**
```
/home/lourival/Documentos/LaurinhaTTT/projects/*
/home/lourival/Documentos/LaurinhaTTT/public/pages/*  ← já existe
```

**Paths bloqueados (mesmo que a IA tente):**
```
../   (qualquer traversal)
/services/*
/packages/*
ecosystem.config.js
.env, .env.*
*.pem, *.key
.wa-session/*
```

**Scripts permitidos via `run_project_script`:**
- Apenas scripts declarados no `package.json` do projeto
- Nunca `npm install` direto — a IA pede via tool separado `install_package`
- `install_package` valida o nome contra regex `^[a-z0-9@/._-]+$` e blocklist

**Timeout e kill:**
- Todo script tem timeout de 15s
- Process group kill (`kill -TERM -pgid`) para garantir que filhos morrem junto

### DevEx
Uma coisa que vai travar a IA: ela vai tentar criar um backend sem saber que Express está disponível. O `get_project_info` deve incluir uma lista dos pacotes disponíveis no `node_modules` raiz. Assim ela sabe que pode `require('express')`, `require('axios')`, etc. sem precisar instalar.

### Decisão da Rodada 2
**Tools confirmados (com segurança):**

| Tool | Parâmetros | Segurança |
|------|-----------|-----------|
| `read_file` | `path` relativo | jail em `/projects/` |
| `write_file` | `path`, `content` | jail + blocklist de extensões perigosas |
| `list_dir` | `path` relativo | jail |
| `delete_file` | `path` relativo | jail + sem recursão |
| `run_project_script` | `project`, `script` | só scripts do package.json, 15s timeout |
| `install_package` | `project`, `package` | regex + blocklist, instala na raiz |
| `get_project_status` | `project` | retorna arquivos, logs, erros de sintaxe |
| `create_backend_project` | `name`, `description` | scaffold padrão automático |

---

## Rodada 3 — Roteamento e exposição pública

### Arquiteta
O `pages-server.mjs` atual só serve estático. Precisamos de um segundo serviço ou transformar ele num gateway. Minha preferência: **gateway unificado** na porta 3871:

```
GET /api/:project/*   → api-router interno
GET /*                → arquivo estático de /public/pages/
GET /laura.svg        → SVG especial
```

Assim o Cloudflare tunnel não precisa de nenhuma mudança — já aponta pra 3871. A IA cria um backend chamado `score-api`, fica disponível em `laurinha.asktome.com.br/api/score-api/`.

### Pragmática
Converter `pages-server.mjs` num gateway agora vai quebrar o que funciona. Prefiro: **api-router separado na porta 3872**, e adiciona uma regra de proxy simples no pages-server:

```js
// pages-server.mjs (adição)
if (url.startsWith('/api/')) {
  proxy.web(req, res, { target: 'http://localhost:3872' });
}
```

Assim as duas coisas evoluem independentemente. Pages quebra → não afeta API. API trava → pages continua.

### Segurança
Qualquer que seja a abordagem, o api-router precisa de rate limiting por projeto — um loop infinito no código do projeto vai fazer a rota `/api/esse-projeto/` retornar 500, mas não pode deixar o roteador como um todo travado.

Também: projetos não devem conseguir ler variáveis de ambiente do processo pai. Quando o api-router carrega um projeto via `require`, o projeto herda `process.env` do pai — incluindo API keys. Solução: passar um `env` limpo para o contexto do projeto, ou pelo menos documentar que isso é um risco conhecido da v1.

### DevEx
Do ponto de vista da IA: ela precisa saber o padrão de URL antes de criar o backend. O system prompt deve ser claro:

> "Backends ficam em `laurinha.asktome.com.br/api/nome-do-projeto/`. O `index.js` deve exportar um `express.Router`. Use `req.app.locals` para dados compartilhados, `__dirname` para dados do projeto."

Sem isso a IA vai inventar URLs.

### Decisão da Rodada 3
**Escolha: api-router separado (porta 3872) + proxy no pages-server.**

Razão: isolamento de falhas. Implementação: adicionar 4 linhas de proxy no `pages-server.mjs` e criar um novo `api-router.mjs` gerenciado pelo PM2.

---

## Rodada 4 — O que a IA pode fazer de concreto?

### DevEx
Com esse sistema, a Laura consegue:

**1. Backend com dados persistentes**
```
Usuário: "cria um placar de pontos do grupo"
Laura: cria /projects/placar-grupo/index.js
  - GET /api/placar-grupo/scores → retorna JSON do arquivo
  - POST /api/placar-grupo/add → adiciona pontos
  - Cria /projects/placar-grupo/data/scores.json
Laura: atualiza a página HTML do frontend pra chamar essa API
```

**2. Formulários com backend real**
```
Usuário: "faz um formulário onde o pessoal pode enviar meme"
Laura: cria backend com multer para receber upload
  - Salva em /projects/meme-form/uploads/
  - Retorna link público
Laura: frontend HTML chama POST /api/meme-form/upload
```

**3. Integração com APIs externas**
```
Usuário: "adiciona uma API de clima na página de ranking"
Laura: cria /projects/clima-api/index.js
  - Faz fetch da API de clima (usando axios da raiz)
  - Retorna dados sanitizados pro frontend
```

**4. Automações agendadas**
```
Usuário: "atualiza o ranking todo dia às 8h"
Laura: adiciona um setInterval/cron no projeto
  - Busca dados
  - Escreve no JSON
  - Envia mensagem no WhatsApp via Redis pub/sub
```

### Arquiteta
Ponto 4 é arriscado — cron jobs nos projetos não sobrevivem a reinicializações do api-router. Para tarefas agendadas, a Laura deveria usar o `schedule_message` já existente ou publicar no Redis para o core-backend processar.

### Segurança
Item 3 preocupa: a IA fazendo `fetch` para APIs externas com dados que usuários passaram abre SSRF. O code review precisa ser humano para backends que fazem requests para URLs dinâmicas.

### Decisão da Rodada 4
**Casos de uso aprovados para v1:** persistência com JSON/SQLite, APIs REST simples, integrações com APIs externas fixas (não dinâmicas). Crons e automações no core-backend, não nos projetos.

---

## Plano de Implementação (revisado após peer review)

> Incorpora correções de bugs críticos e melhorias de segurança identificadas na revisão.

---

### Fase 1 — Infraestrutura (sem IA ainda)

**1.1 — Estrutura de pastas no servidor**
```
/home/lourival/Documentos/LaurinhaTTT/
├── projects/              ← NOVO — projetos da IA
│   └── .gitkeep
└── services/
    └── api-router/        ← NOVO
        ├── index.mjs
        └── package.json   ← { "type": "module" }
```

**1.2 — api-router/index.mjs** (versão corrigida)

Bugs corrigidos vs rascunho original:
- `createRequire` fora do handler (era `ReferenceError` no original)
- `process.on('uncaughtException')` para não derrubar no erro async da IA
- Validação de nome de projeto (evita path injection via URL)
- Verificação que o export é realmente uma função

```js
import express from 'express';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { join, resolve } from 'path';

// Captura erros não tratados — sem isso, uma rota async com bug mata TODOS os projetos
process.on('uncaughtException', (err) =>
  console.error('[api-router] uncaughtException:', err.message));
process.on('unhandledRejection', (reason) =>
  console.error('[api-router] unhandledRejection:', reason));

const app = express();
const PROJECTS_ROOT = resolve('/home/lourival/Documentos/LaurinhaTTT/projects');

// createRequire fora do handler — require.cache precisa ser o mesmo objeto em todas as calls
const require = createRequire(import.meta.url);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/:project', (req, res, next) => {
  const name = req.params.project;

  // Bloqueia nomes com caracteres que podem escalar pastas
  if (!/^[a-z0-9-_]+$/.test(name)) {
    return res.status(400).json({ error: 'nome de projeto inválido' });
  }

  const projectDir = join(PROJECTS_ROOT, name);
  const entry = join(projectDir, 'index.js');

  if (!existsSync(entry)) {
    return res.status(404).json({ error: `projeto "${name}" não encontrado` });
  }

  try {
    // Hot reload: invalida cache do index.js E de todos os arquivos do projeto (ex: utils.js)
    Object.keys(require.cache)
      .filter(k => k.startsWith(projectDir))
      .forEach(k => delete require.cache[k]);

    const router = require(entry);

    if (typeof router !== 'function') {
      throw new Error('index.js deve exportar um express.Router via module.exports');
    }

    router(req, res, next);
  } catch (err) {
    console.error(`[api-router] "${name}" crashed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3872, () => console.log('[api-router] listening on :3872'));
```

**1.3 — Proxy no pages-server.mjs**

Inclui handler de erro — sem ele, api-router offline derruba o pages-server:

```js
import httpProxy from 'http-proxy';
const apiProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:3872' });

// Sem esse handler, erro de conexão lança exceção não tratada no pages-server
apiProxy.on('error', (err, req, res) => {
  console.error('[proxy] api-router indisponível:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API temporariamente indisponível' }));
  }
});

// No handler HTTP existente, antes de servir estáticos:
// if (url.startsWith('/api/')) return apiProxy.web(req, res);
```

**1.4 — Adicionar ao ecosystem.config.js**
```js
{
  name: 'api-router',
  script: 'services/api-router/index.mjs',
  cwd: '/home/lourival/Documentos/LaurinhaTTT',
  watch: false, // hot reload é manual via invalidação de cache, não via PM2 watch
  env: {
    NODE_PATH: '/home/lourival/Documentos/LaurinhaTTT/node_modules',
    NODE_ENV: 'production',
  }
}
```

**1.5 — Pacote http-proxy na raiz**
```bash
npm install http-proxy --save
```

---

### Fase 2 — Tools MCP no core-backend

**Novo arquivo:** `services/core-backend/src/ai/code-tools.ts`

**`safePath` corrigida** (versão original tinha bug de prefix matching):

```typescript
import path from 'path';
import { realpathSync, existsSync } from 'fs';

function safePath(root: string, userInput: string): string {
  // Remove null bytes (bypass de validação de string)
  const clean = userInput.replace(/\0/g, '').replace(/^\//, '');
  const resolved = path.resolve(root, clean);

  // Trailing slash obrigatório — sem isso "projects-evil".startsWith("projects") = true
  const rootNorm = root.endsWith('/') ? root : root + '/';

  if (!resolved.startsWith(rootNorm) && resolved !== root) {
    throw new Error(`acesso negado: caminho fora da área permitida`);
  }

  // Resolve symlinks para prevenir bypass via links simbólicos
  if (existsSync(resolved)) {
    const real = realpathSync(resolved);
    if (!real.startsWith(rootNorm) && real !== root) {
      throw new Error(`acesso negado: symlink aponta para fora da área permitida`);
    }
  }

  return resolved;
}
```

**Tools e seus contratos:**

| Tool | Segurança adicionada |
|------|---------------------|
| `read_file(path)` | safePath jail + realpath |
| `write_file(path, content)` | safePath + backup automático se arquivo já existir |
| `list_dir(path)` | safePath, retorna `{name, type, size, modified}[]` |
| `delete_file(path)` | safePath, sem recursão (só arquivos) |
| `search_files(query)` | grep recursivo em /projects/, retorna `file:line` |
| `get_project_status(project)` | arquivos + `node --check` para erros de sintaxe com linha + últimos erros |
| `run_project_script(project, script)` | spawn não exec, só scripts do package.json, 15s + kill SIGTERM |
| `install_package(package)` | regex `^[@a-z0-9/._-]+$`, instala na raiz |
| `create_backend_project(name)` | scaffold CJS com comentários explícitos |

**`write_file` com backup automático:**
```typescript
// Antes de sobrescrever qualquer arquivo existente
if (existsSync(resolvedPath)) {
  const backupDir = path.join(path.dirname(resolvedPath), '.backups');
  mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(resolvedPath)}.${ts}`);
  copyFileSync(resolvedPath, backupPath);
}
```

**`run_project_script` com spawn seguro:**
```typescript
import { spawn } from 'child_process';

const child = spawn('npm', ['run', scriptName], {
  cwd: projectDir,
  env: { NODE_ENV: 'production', NODE_PATH: config.nodeModulesRoot },
  shell: false,      // sem /bin/sh — impede injeção de operadores ; && |
  detached: true,    // permite matar o process group inteiro
});

const timer = setTimeout(() => {
  try { process.kill(-child.pid!, 'SIGTERM'); } catch {}
  reject(new Error('timeout de 15s excedido'));
}, 15_000);
```

**`get_project_status` formato estruturado** (a IA precisa de `line` para navegar):
```json
{
  "project": "placar-grupo",
  "files": [
    { "name": "index.js", "size": 1240, "modified": "2026-06-04T14:30:00Z" },
    { "name": "data/scores.json", "size": 88, "modified": "2026-06-04T14:32:00Z" }
  ],
  "syntax_ok": false,
  "syntax_errors": [
    { "line": 14, "col": 3, "message": "Unexpected token '}'" }
  ],
  "available_modules": ["express", "axios", "sqlite3", "uuid", "fs", "path", "crypto"]
}
```

**Scaffold de projeto** (`create_backend_project`):
```js
// IMPORTANTE: Este arquivo usa CommonJS (require/module.exports).
// NÃO use import/export — o sistema não suporta ESM nos projetos.
// NÃO use process.env — variáveis de ambiente do sistema não estão disponíveis.
// NÃO use setInterval/setTimeout global — não sobrevive a hot reload.
// Dados persistentes: salve em arquivos dentro de __dirname/data/

const { Router } = require('express');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const router = Router();
const DATA_DIR = join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

router.get('/status', (req, res) => {
  res.json({ project: 'NOME', ok: true, ts: Date.now() });
});

module.exports = router;
```

---

### Fase 3 — System prompt e integração

**Adições ao SYSTEM_PROMPT** (só ativas com `!!dev on`):

```
### Modo Desenvolvedor (ativo):

Você pode criar e modificar backends Node.js reais. Cada projeto vira uma API em
laurinha.asktome.com.br/api/nome-do-projeto/

Fluxo para criar:
1. create_backend_project('nome') → cria estrutura base
2. write_file('nome/index.js', código) → escreve a lógica
3. get_project_status('nome') → verifica erros de sintaxe (retorna linha exata)
4. Se houver erro: read_file → corrigir → write_file → get_project_status de novo

Fluxo para modificar:
1. read_file('nome/index.js') → lê o código atual ANTES de qualquer mudança
2. write_file('nome/index.js', código corrigido) → sobrescreve
3. get_project_status → confirma sem erros

Regras obrigatórias:
- Use require() e module.exports — nunca import/export
- Módulos disponíveis sem instalar: express, axios, fs, path, crypto, sqlite3, uuid
- Dados: salve em arquivos JSON dentro de __dirname/data/
- NUNCA use setInterval/setTimeout global (não sobrevive a hot reload)
- NUNCA use process.env (não disponível nos projetos)
- NUNCA leia ou escreva fora da pasta do projeto
- Sempre envolva rotas async em try/catch e retorne res.status(500).json({error})
- Links das APIs: sempre laurinha.asktome.com.br/api/nome-do-projeto/rota
```

---

### Fase 4 — Gate `!!dev` (obrigatório)

Só o dono pode ativar. Validação por `platformId`, não por `userName`:

```typescript
// command.router.ts
case 'dev': {
  // Gate estrito — verifica platformId do dono, não só userName
  const isOwner = message.userId === config.ownerPlatformId;
  if (!isOwner) return null;

  const arg = text.slice('!!dev'.length).trim().toLowerCase();
  if (arg === 'on') {
    devModeActive = true;
    return reply('modo dev ativado — code tools habilitados');
  }
  if (arg === 'off') {
    devModeActive = false;
    return reply('modo dev desativado');
  }
  if (arg === 'status') {
    // Lista projetos existentes
    const projects = readdirSync(config.projectsDir)
      .filter(f => statSync(join(config.projectsDir, f)).isDirectory());
    return reply(`dev: ${devModeActive ? 'ON' : 'OFF'}\nprojetos: ${projects.join(', ') || 'nenhum'}`);
  }
}
```

---

## Resumo das Decisões (atualizado)

| Questão | Decisão |
|---------|---------|
| Isolamento de projetos | Dynamic require + uncaughtException (v1), worker threads (v2) |
| Módulos compartilhados | `NODE_PATH` → node_modules raiz, `"type": "commonjs"` no scaffold |
| Roteamento | api-router porta 3872, proxy com handler de erro no pages-server |
| Path jail | `path.resolve` + trailing slash + `realpathSync` contra symlinks |
| Pacotes disponíveis | express, axios, fs, path, crypto, sqlite3, uuid |
| Persistência | JSON para simples, SQLite para médio, PostgreSQL para grande |
| Backup | Automático em `.backups/` antes de qualquer write_file sobrescrever |
| run_project_script | `spawn` não `exec`, shell: false, 15s + SIGTERM no process group |
| get_project_status | JSON estruturado com `{line, col, message}` para erros de sintaxe |
| Tool search_files | Adicionado — grep recursivo em /projects/ |
| Quem pode usar code tools | Só o dono via `!!dev on`, validado por platformId |
| Crons/automações | Redis pub/sub → core-backend, nunca em projetos |
| process.env | Não disponível nos projetos (documentado no scaffold e system prompt) |
| setInterval global | Proibido nos projetos (não sobrevive hot reload) |

---

## Checklist de validação manual antes de ligar para a IA

```bash
# 1. Criar projeto de teste manualmente
mkdir -p projects/hello-world/data
# escrever index.js com GET /status

# 2. Subir api-router
pm2 start ecosystem.config.js --only api-router

# 3. Verificar roteamento direto
curl http://localhost:3872/api/hello-world/status

# 4. Verificar via Cloudflare (proxy pages-server)
curl https://laurinha.asktome.com.br/api/hello-world/status

# 5. Testar hot reload — editar index.js, request imediata deve refletir mudança

# 6. Testar path traversal
# write_file('../../ecosystem.config.js', 'test') → deve retornar erro

# 7. Testar resilência — derrubar api-router, verificar pages-server ainda responde

# 8. Só depois: !!dev on e deixar a IA criar um backend de placar
```

