'use strict';
const express = require('express');
const { existsSync } = require('fs');
const { join, resolve } = require('path');

// Armazena o último erro de cada projeto para o get_project_status consultar
const projectLastError = new Map();
global.__projectLastError = projectLastError;

// Sem isso, erro async em qualquer projeto derruba TODOS os projetos
process.on('uncaughtException', (err) =>
  console.error('[api-router] uncaughtException:', err.message, err.stack));
process.on('unhandledRejection', (reason) =>
  console.error('[api-router] unhandledRejection:', reason));

const app = express();
const PROJECTS_ROOT = resolve(process.env.PROJECTS_DIR || '/home/lourival/Documentos/LaurinhaTTT/projects');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS básico para o frontend poder chamar a API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/api/:project', (req, res, next) => {
  const name = req.params.project;

  if (!/^[a-z0-9-_]+$/.test(name)) {
    return res.status(400).json({ error: 'nome de projeto inválido' });
  }

  const projectDir = join(PROJECTS_ROOT, name);
  const entry = join(projectDir, 'index.js');

  if (!existsSync(entry)) {
    return res.status(404).json({ error: `projeto "${name}" não encontrado` });
  }

  try {
    // Hot reload: invalida cache de todos os arquivos do projeto (inclui utils, db, etc.)
    Object.keys(require.cache)
      .filter(k => k.startsWith(projectDir))
      .forEach(k => delete require.cache[k]);

    const router = require(entry);

    if (typeof router !== 'function') {
      throw new Error('index.js deve exportar um express.Router via module.exports = router');
    }

    router(req, res, next);
  } catch (err) {
    console.error(`[api-router] "${name}" error:`, err.message);
    projectLastError.set(name, { message: err.message, ts: new Date().toISOString() });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api', (req, res) => {
  const { readdirSync, statSync } = require('fs');
  try {
    const projects = readdirSync(PROJECTS_ROOT)
      .filter(f => {
        try { return statSync(join(PROJECTS_ROOT, f)).isDirectory(); } catch { return false; }
      });
    res.json({ projects, base_url: 'https://laurinha.asktome.com.br/api/' });
  } catch {
    res.json({ projects: [], base_url: 'https://laurinha.asktome.com.br/api/' });
  }
});

const PORT = parseInt(process.env.API_ROUTER_PORT || '3872');
app.listen(PORT, () => {
  console.log(`[api-router] listening on :${PORT}`);
  console.log(`[api-router] projects root: ${PROJECTS_ROOT}`);
});
