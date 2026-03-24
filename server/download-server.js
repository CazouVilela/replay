// server/download-server.js
// Servidor minimo para servir o Replay.exe para download
// Roda em http://localhost:9080

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9080;
const DIST_DIR = path.join(__dirname, '..', 'dist');

function getLatestExe() {
  if (!fs.existsSync(DIST_DIR)) return null;
  const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.exe'));
  if (files.length === 0) return null;
  // Pegar o mais recente
  files.sort((a, b) => {
    const sa = fs.statSync(path.join(DIST_DIR, a));
    const sb = fs.statSync(path.join(DIST_DIR, b));
    return sb.mtimeMs - sa.mtimeMs;
  });
  return files[0];
}

function formatSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function renderPage(exeFile) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  let fileInfo = '';
  if (exeFile) {
    const stat = fs.statSync(path.join(DIST_DIR, exeFile));
    fileInfo = `
      <div class="file-info">
        <div class="file-name">${exeFile}</div>
        <div class="file-meta">${formatSize(stat.size)} &middot; ${stat.mtime.toLocaleDateString('pt-BR')}</div>
      </div>
      <a href="/download" class="btn-download">Baixar Replay</a>
    `;
  } else {
    fileInfo = '<p class="no-file">Nenhum build disponivel.</p>';
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Replay - Download</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #16213e;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .logo {
      font-size: 36px;
      font-weight: 800;
      color: #2ecc71;
      letter-spacing: 3px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #7ec8e3;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .version {
      color: #555;
      font-size: 12px;
      margin-bottom: 24px;
    }
    .file-info {
      background: #0f3460;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .file-name {
      font-weight: 600;
      font-size: 15px;
    }
    .file-meta {
      color: #7ec8e3;
      font-size: 12px;
      margin-top: 4px;
    }
    .btn-download {
      display: inline-block;
      background: #2ecc71;
      color: #1a1a2e;
      text-decoration: none;
      padding: 14px 40px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      transition: background 0.2s;
    }
    .btn-download:hover { background: #27ae60; }
    .no-file { color: #e74c3c; }
    .footer {
      margin-top: 32px;
      color: #444;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">REPLAY</div>
    <div class="subtitle">Extrator de Agenda ZenFisio</div>
    <div class="version">v${pkg.version}</div>
    ${fileInfo}
    <div class="footer">Windows 10/11 &middot; Nao requer instalacao</div>
  </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const exeFile = getLatestExe();

  if (req.url === '/download' && exeFile) {
    const filePath = path.join(DIST_DIR, exeFile);
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${exeFile}"`,
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    const html = renderPage(exeFile);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Replay download server rodando em http://localhost:${PORT}`);
});
