import { createServer, request as httpRequest } from 'http';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { readdir } from 'fs/promises';

const API_ROUTER_PORT = 3872;

function proxyToApiRouter(req, res) {
  const options = {
    hostname: '127.0.0.1',
    port: API_ROUTER_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API temporariamente indisponível' }));
    }
  });
  req.pipe(proxyReq);
}

const PORT = parseInt(process.env.PAGES_PORT ?? '3871');
const PAGES_DIR = process.env.PAGES_DIR ?? '/home/lourival/Documentos/LaurinhaTTT/public/pages';

mkdirSync(PAGES_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  let pathname = decodeURIComponent(url.pathname);

  // Proxy para o api-router — projetos backend da IA
  if (pathname.startsWith('/api/') || pathname === '/api') {
    return proxyToApiRouter(req, res);
  }

  // Index: lista de páginas
  if (pathname === '/' || pathname === '') {
    const files = await readdir(PAGES_DIR).catch(() => []);
    const links = files
      .filter(f => f.endsWith('.html'))
      .map(f => `<li><a href="/${f}">${f.replace('.html', '')}</a></li>`)
      .join('\n');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body><h2>Páginas da Laura</h2><ul>${links || '<li>Nenhuma página ainda</li>'}</ul></body></html>`);
    return;
  }

  // Serve arquivo
  let filePath = join(PAGES_DIR, pathname);

  // Adiciona .html se não tiver extensão
  if (!extname(filePath) && existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laura — Ainda não existe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0f0f0f;
      color: #fff;
      font-family: 'Segoe UI', sans-serif;
      text-align: center;
      padding: 2rem;
    }
    h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { color: #888; font-size: 1rem; max-width: 360px; line-height: 1.6; margin-bottom: 1.5rem; }
    .badge {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 999px;
      padding: 0.4rem 1rem;
      font-size: 0.8rem;
      color: #555;
    }
    .pulse {
      display: inline-block;
      width: 8px; height: 8px;
      background: #25d366;
      border-radius: 50%;
      margin-right: 6px;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.2; }
    }
  </style>
</head>
<body>
  <img src="/laura.svg" width="160" height="160" alt="Laura" style="margin-bottom:1rem;object-fit:contain"/>
  <h1>Essa página ainda não existe</h1>
  <p>A Laura ainda não criou nada aqui. Pede pra ela no grupo e ela faz na hora.</p>
  <div class="badge"><span class="pulse"></span>laurinha.asktome.com.br</div>
</body>
</html>`);
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[pages] servidor rodando em http://localhost:${PORT}`);
  console.log(`[pages] servindo arquivos de: ${PAGES_DIR}`);
});
