import type { ChatCompletionTool } from 'openai/resources/chat';
import {
  existsSync, mkdirSync, readdirSync, statSync,
  readFileSync, writeFileSync, copyFileSync, rmSync, realpathSync,
} from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { spawnSync, spawn } from 'child_process';
import { config } from '../config';
import type { ToolResult } from './tools';

const PROJECTS_ROOT = config.projectsDir;
const PAGES_ROOT = config.pagesDir;
const NODE_MODULES_ROOT = config.nodeModulesRoot;

// Namespace unificado:
//   "pages/xxx.html"  → /public/pages/xxx.html
//   "projeto/index.js" → /projects/projeto/index.js
function safePath(userInput: string): string {
  const clean = userInput.replace(/\0/g, '').replace(/^\/+/, '');

  const isPages = clean === 'pages' || clean.startsWith('pages/');
  const root = isPages ? PAGES_ROOT : PROJECTS_ROOT;
  const sub  = isPages ? clean.slice(clean.startsWith('pages/') ? 6 : 5) : clean;
  const rootNorm = root.endsWith('/') ? root : root + '/';
  const resolved = sub ? resolve(root, sub) : root;

  if (sub && !resolved.startsWith(rootNorm) && resolved !== root) {
    throw new Error(`acesso negado: caminho fora de ${isPages ? 'pages/' : 'projects/'}`);
  }
  if (existsSync(resolved)) {
    const real = realpathSync(resolved);
    if (!real.startsWith(rootNorm) && real !== root) {
      throw new Error('acesso negado: symlink fora da área permitida');
    }
  }
  return resolved;
}

function backupFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const backupDir = join(dirname(filePath), '.backups');
  mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(filePath, join(backupDir, `${basename(filePath)}.${ts}`));
}

function scaffoldIndex(name: string): string {
  return `// IMPORTANTE: Este arquivo usa CommonJS (require/module.exports).
// NÃO use import/export — o sistema não suporta ESM nos projetos.
// NÃO use process.env — variáveis de ambiente não estão disponíveis.
// NÃO use setInterval/setTimeout global — não sobrevive a hot reload.
// Dados persistentes: salve arquivos em __dirname/data/

const { Router } = require('express');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const router = Router();
const DATA_DIR = join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

router.get('/status', (req, res) => {
  res.json({ project: '${name}', ok: true, ts: Date.now() });
});

// Adicione suas rotas aqui

module.exports = router;
`;
}

export const CODE_TOOL_NAMES = new Set([
  'create_backend_project', 'read_file', 'write_file', 'patch_file', 'list_dir',
  'delete_file', 'search_files', 'get_project_status',
  'run_project_script', 'install_package',
]);

export const codeTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_backend_project',
      description: 'Cria a estrutura de um novo projeto backend com scaffold padrão. Gera index.js e package.json. A URL do projeto será /api/nome/',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do projeto: só letras minúsculas, números e hifens (ex: "placar-grupo", "clima-api")' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo de um arquivo. Namespace: "pages/xxx.html" = frontend HTML, "projeto/index.js" = backend. Sempre leia antes de modificar.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho com namespace: "pages/diario-app.html" para frontend, "diario-app/index.js" para backend' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Escreve ou sobrescreve um arquivo. Namespace: "pages/xxx.html" edita frontend diretamente (sem page-builder), "projeto/index.js" edita backend. Faz backup automático.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho com namespace (ex: "pages/diario-app.html" ou "diario-app/index.js")' },
          content: { type: 'string', description: 'Conteúdo completo do arquivo' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'Lista arquivos e pastas. "" mostra visão geral de backends e páginas frontend. "pages" lista só o frontend. "projeto-x" lista só aquele backend.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '""=tudo, "pages"=frontend, "pages/slug"=arquivo específico, "projeto"=backend' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Remove um arquivo (não diretórios). Faz backup antes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description: 'Faz uma substituição cirúrgica num arquivo: encontra old_string (deve ser único no arquivo) e substitui por new_string. Use para correções pontuais sem reescrever o arquivo inteiro. Falha se old_string aparecer 0 ou mais de 1 vez — nesse caso, inclua mais contexto ao redor para torná-lo único.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho com namespace (ex: "pages/diario-app.html" ou "diario-app/index.js")' },
          old_string: { type: 'string', description: 'Trecho exato a substituir. Deve aparecer exatamente 1 vez no arquivo. Inclua linhas de contexto ao redor se o trecho for curto.' },
          new_string: { type: 'string', description: 'Texto que substitui old_string. Use string vazia para deletar.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Busca texto em backends (.js) E frontend (.html). Retorna arquivo:linha. Use quando um erro reportado precisa ser rastreado entre frontend e backend.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a buscar (ex: "token", "Authorization", "register")' },
          scope: { type: 'string', description: 'Onde buscar: "all"=tudo (padrão), "pages"=só frontend, "projects"=só backends, ou nome de um projeto específico' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_status',
      description: 'Retorna arquivos do projeto, erros de sintaxe com linha exata e módulos disponíveis. Use após write_file para confirmar que o código está correto.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Nome do projeto (ex: "placar-grupo")' },
        },
        required: ['project'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_project_script',
      description: 'Executa um script definido no package.json do projeto (timeout 15s). Use para seeds de dados, testes, etc.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Nome do projeto' },
          script: { type: 'string', description: 'Nome do script do package.json' },
        },
        required: ['project', 'script'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'install_package',
      description: 'Instala um pacote npm disponível para todos os projetos. Use quando precisar de algo além de: express, axios, sqlite3, uuid, fs, path, crypto.',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'Nome do pacote npm (ex: "bcrypt", "dayjs")' },
        },
        required: ['package'],
      },
    },
  },
];

function listFilesRec(dir: string, base = ''): Array<{ name: string; size: number }> {
  const result: Array<{ name: string; size: number }> = [];
  for (const f of readdirSync(dir)) {
    if (f === '.backups' || f === 'node_modules') continue;
    const full = join(dir, f);
    const rel = base ? `${base}/${f}` : f;
    try {
      const st = statSync(full);
      if (st.isDirectory()) result.push(...listFilesRec(full, rel));
      else result.push({ name: rel, size: st.size });
    } catch { /* skip */ }
  }
  return result;
}

export async function executeCodeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {

  if (name === 'create_backend_project') {
    const { name: projectName } = input as { name: string };
    if (!projectName || !/^[a-z0-9-_]+$/.test(projectName)) {
      return { type: 'text', text: 'nome inválido: use só letras minúsculas, números e hifens' };
    }
    const projectDir = join(PROJECTS_ROOT, projectName);
    if (existsSync(projectDir)) {
      return { type: 'text', text: `projeto "${projectName}" já existe. use read_file("${projectName}/index.js") para ver o código.` };
    }
    mkdirSync(join(projectDir, 'data'), { recursive: true });
    writeFileSync(join(projectDir, 'index.js'), scaffoldIndex(projectName), 'utf-8');
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify(
      { name: projectName, version: '1.0.0', type: 'commonjs', scripts: { test: 'echo "no tests"' } },
      null, 2,
    ), 'utf-8');
    return { type: 'text', text: `projeto "${projectName}" criado.\nURL: https://laurinha.asktome.com.br/api/${projectName}/status\nAgora escreva o index.js com write_file e use get_project_status para verificar erros.` };
  }

  if (name === 'read_file') {
    const { path: userPath } = input as { path: string };
    try {
      const filePath = safePath(userPath);
      if (!existsSync(filePath)) return { type: 'text', text: `arquivo não encontrado: ${userPath}` };
      const st = statSync(filePath);
      if (st.isDirectory()) return { type: 'text', text: `"${userPath}" é um diretório. use list_dir.` };
      const content = readFileSync(filePath, 'utf-8');
      return { type: 'text', text: content.length > 8000 ? content.slice(0, 8000) + '\n...[truncado]' : content };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'write_file') {
    const { path: userPath, content } = input as { path: string; content: string };
    try {
      const filePath = safePath(userPath);
      backupFile(filePath);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');

      // Validação automática — só para arquivos JS de backend (não para pages/)
      const warnings: string[] = [];
      const isBackendJs = userPath.endsWith('index.js') && !userPath.startsWith('pages/');
      if (isBackendJs) {
        if (/\bconst\s+app\s*=\s*express\s*\(\)/.test(content))
          warnings.push('ERRO: use "const router = Router()" em vez de "const app = express()". O projeto é um Router, não um app standalone.');
        if (/app\.listen\s*\(/.test(content))
          warnings.push('ERRO: remova o app.listen(). O api-router gerencia a porta. Substitua por "module.exports = router" no final.');
        if (/\bexport\s+default\b/.test(content) || /\bexport\s*\{/.test(content))
          warnings.push('ERRO: use "module.exports = router" (CommonJS), nunca "export default" ou "export {}" (ESM).');
        if (!/module\.exports\s*=/.test(content))
          warnings.push('AVISO: não encontrei "module.exports = router" no final. O arquivo precisa exportar o router.');
        if (/app\.(get|post|put|delete|patch)\s*\(\s*['"`]\/api\//.test(content))
          warnings.push('AVISO: rotas começando com "/api/" estão erradas. O api-router já adiciona /api/nome-do-projeto. Use "/register", não "/api/register".');
        // Detecta auth por username+password no body de rota autenticada (anti-padrão)
        if (/req\.body\s*\.\s*password/.test(content) && !/authorization/i.test(content) && /put|patch|delete/i.test(content))
          warnings.push('AVISO de autenticação: rotas PUT/DELETE não devem pedir password no body. Use Bearer token: extraia de req.headers.authorization e valide contra o token salvo no usuário. O frontend envia Authorization: Bearer <token> e espera { token } no login/register.');
      }

      const warningText = warnings.length
        ? `\n\n⚠️ PROBLEMAS DETECTADOS — corrija antes de testar:\n${warnings.map(w => `• ${w}`).join('\n')}`
        : '';
      return { type: 'text', text: `escrito: ${userPath} (${content.length} chars).${warningText}${warnings.length ? '' : ' use get_project_status para verificar sintaxe.'}` };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'patch_file') {
    const { path: userPath, old_string, new_string: newStr } = input as { path: string; old_string: string; new_string: string };
    try {
      const filePath = safePath(userPath);
      if (!existsSync(filePath)) return { type: 'text', text: `arquivo não encontrado: ${userPath}` };
      const content = readFileSync(filePath, 'utf-8');

      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        return { type: 'text', text: `old_string não encontrado em "${userPath}". Use read_file para ver o conteúdo atual e copiar o trecho exato (incluindo espaços e quebras de linha).` };
      }
      if (occurrences > 1) {
        return { type: 'text', text: `old_string encontrado ${occurrences} vezes em "${userPath}" — ambíguo. Inclua mais linhas de contexto ao redor para torná-lo único.` };
      }

      backupFile(filePath);
      writeFileSync(filePath, content.replace(old_string, newStr), 'utf-8');

      const lines = old_string.split('\n').length;
      return { type: 'text', text: `patch aplicado em "${userPath}" (substituiu ${lines} linha${lines > 1 ? 's' : ''})` };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'list_dir') {
    const { path: userPath } = input as { path: string };
    try {
      // "" → visão geral de ambos os namespaces
      if (!userPath) {
        const listDir = (dir: string, prefix: string) =>
          existsSync(dir)
            ? readdirSync(dir).filter(f => f !== '.backups' && f !== '.user-slugs.json').map(f => {
                const st = statSync(join(dir, f));
                return { name: `${prefix}${f}`, type: st.isDirectory() ? 'dir' : 'file', size: st.isFile() ? st.size : undefined };
              })
            : [];
        const result = {
          backends: listDir(PROJECTS_ROOT, ''),
          frontend_pages: listDir(PAGES_ROOT, 'pages/'),
        };
        return { type: 'text', text: JSON.stringify(result, null, 2) };
      }

      const dirPath = safePath(userPath);
      if (!existsSync(dirPath)) return { type: 'text', text: `diretório não encontrado: ${userPath}` };
      const entries = readdirSync(dirPath)
        .filter(f => f !== '.backups')
        .map(f => {
          const st = statSync(join(dirPath, f));
          return { name: f, type: st.isDirectory() ? 'dir' : 'file', size: st.isFile() ? st.size : undefined };
        });
      return { type: 'text', text: JSON.stringify(entries, null, 2) };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'delete_file') {
    const { path: userPath } = input as { path: string };
    try {
      const filePath = safePath(userPath);
      if (!existsSync(filePath)) return { type: 'text', text: 'arquivo não encontrado' };
      if (statSync(filePath).isDirectory()) return { type: 'text', text: 'não posso deletar diretórios, só arquivos' };
      backupFile(filePath);
      rmSync(filePath);
      return { type: 'text', text: `deletado: ${userPath}` };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'search_files') {
    const { query, scope } = input as { query: string; scope?: string };
    try {
      const searches: Array<{ root: string; includes: string[] }> = [];

      if (!scope || scope === 'all') {
        searches.push({ root: PROJECTS_ROOT, includes: ['*.js'] });
        searches.push({ root: PAGES_ROOT, includes: ['*.html'] });
      } else if (scope === 'pages') {
        searches.push({ root: PAGES_ROOT, includes: ['*.html'] });
      } else if (scope === 'projects') {
        searches.push({ root: PROJECTS_ROOT, includes: ['*.js'] });
      } else {
        // nome de projeto específico
        const projectDir = join(PROJECTS_ROOT, scope);
        if (!existsSync(projectDir)) return { type: 'text', text: `projeto "${scope}" não encontrado` };
        searches.push({ root: projectDir, includes: ['*.js'] });
      }

      let combined = '';
      for (const s of searches) {
        if (!existsSync(s.root)) continue;
        const includeArgs = s.includes.flatMap(i => ['--include=' + i]);
        const result = spawnSync('grep', ['-rn', ...includeArgs, query, s.root], {
          encoding: 'utf-8', timeout: 5000,
        });
        if (result.stdout) combined += result.stdout;
      }

      // Torna os caminhos relativos para legibilidade
      const readable = combined
        .replace(new RegExp(PROJECTS_ROOT + '/?', 'g'), '')
        .replace(new RegExp(PAGES_ROOT + '/?', 'g'), 'pages/')
        .trim()
        .slice(0, 4000);

      return { type: 'text', text: readable || `nenhum resultado para "${query}"` };
    } catch (e) { return { type: 'text', text: (e as Error).message }; }
  }

  if (name === 'get_project_status') {
    const { project } = input as { project: string };
    if (!/^[a-z0-9-_]+$/.test(project)) return { type: 'text', text: 'nome de projeto inválido' };
    const projectDir = join(PROJECTS_ROOT, project);
    if (!existsSync(projectDir)) return { type: 'text', text: `projeto "${project}" não encontrado. use list_dir("") para ver os projetos existentes.` };

    const files = listFilesRec(projectDir);

    // Verifica sintaxe do index.js
    let syntaxOk = true;
    const syntaxErrors: Array<{ line: number; message: string }> = [];
    const indexPath = join(projectDir, 'index.js');
    if (existsSync(indexPath)) {
      const check = spawnSync(process.execPath, ['--check', indexPath], {
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, NODE_PATH: NODE_MODULES_ROOT },
      });
      if (check.status !== 0) {
        syntaxOk = false;
        const stderr = check.stderr ?? '';
        const lineMatch = stderr.match(/:(\d+)\n?(SyntaxError[^\n]*)/m);
        if (lineMatch) {
          syntaxErrors.push({ line: parseInt(lineMatch[1]), message: lineMatch[2].trim() });
        } else {
          syntaxErrors.push({ line: 0, message: stderr.slice(0, 300).trim() });
        }
      }
    }

    // Último erro de runtime do api-router (se disponível)
    const lastError = (global as Record<string, unknown>).__projectLastError instanceof Map
      ? ((global as Record<string, unknown>).__projectLastError as Map<string, unknown>).get(project)
      : undefined;

    return {
      type: 'text',
      text: JSON.stringify({
        project,
        url: `https://laurinha.asktome.com.br/api/${project}/status`,
        files,
        syntax_ok: syntaxOk,
        syntax_errors: syntaxErrors,
        last_runtime_error: lastError ?? null,
        available_modules: ['express', 'axios', 'sqlite3', 'uuid', 'fs', 'path', 'crypto', 'http', 'url', 'events'],
      }, null, 2),
    };
  }

  if (name === 'run_project_script') {
    const { project, script } = input as { project: string; script: string };
    const projectDir = join(PROJECTS_ROOT, project);
    if (!existsSync(projectDir)) return { type: 'text', text: `projeto "${project}" não encontrado` };
    const pkgPath = join(projectDir, 'package.json');
    if (!existsSync(pkgPath)) return { type: 'text', text: 'package.json não encontrado' };
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    if (!scripts[script]) {
      return { type: 'text', text: `script "${script}" não existe. disponíveis: ${Object.keys(scripts).join(', ')}` };
    }

    return new Promise((res_p) => {
      const child = spawn('npm', ['run', script], {
        cwd: projectDir,
        env: { ...process.env, NODE_ENV: 'production', NODE_PATH: NODE_MODULES_ROOT },
        shell: false,
        detached: true,
      });
      let output = '';
      child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });
      const timer = setTimeout(() => {
        try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* ignore */ }
        res_p({ type: 'text', text: `timeout 15s. output parcial:\n${output.slice(0, 1000)}` });
      }, 15_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        res_p({ type: 'text', text: `exit ${code}\n${output.slice(0, 2000)}` });
      });
    });
  }

  if (name === 'install_package') {
    const { package: pkg } = input as { package: string };
    if (!pkg || !/^[@a-z0-9/._-]+$/.test(pkg)) {
      return { type: 'text', text: 'nome de pacote inválido' };
    }
    const BLOCKED = ['shelljs', 'execa', 'node-pty', 'vm2', 'isolated-vm'];
    if (BLOCKED.some(b => pkg.includes(b))) {
      return { type: 'text', text: `pacote "${pkg}" não permitido` };
    }
    return new Promise((res_p) => {
      const child = spawn('npm', ['install', pkg, '--save'], {
        cwd: config.nodeModulesRoot.replace('/node_modules', ''),
        env: { ...process.env },
        shell: false,
      });
      let output = '';
      child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });
      const timer = setTimeout(() => {
        try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* ignore */ }
        res_p({ type: 'text', text: `timeout ao instalar "${pkg}"` });
      }, 60_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        res_p({ type: 'text', text: code === 0 ? `"${pkg}" instalado com sucesso. já disponível para todos os projetos.` : `erro ao instalar:\n${output.slice(0, 500)}` });
      });
    });
  }

  return { type: 'text', text: `tool de código desconhecido: ${name}` };
}
