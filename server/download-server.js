// server/download-server.js
// Servidor para servir builds do Replay para download
// Roda em http://localhost:9080

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9080;
const DIST_DIR = path.join(__dirname, '..', 'dist');

function getAllExes() {
  if (!fs.existsSync(DIST_DIR)) return [];
  const files = fs.readdirSync(DIST_DIR)
    .filter(f => f.endsWith('.exe') && f.includes('Setup') && !f.includes('uninstaller'));
  // Ordenar por data (mais recente primeiro)
  files.sort((a, b) => {
    const sa = fs.statSync(path.join(DIST_DIR, a));
    const sb = fs.statSync(path.join(DIST_DIR, b));
    return sb.mtimeMs - sa.mtimeMs;
  });
  return files;
}

function formatSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function extractVersion(filename) {
  const m = filename.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : '?';
}

function renderPage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  const allExes = getAllExes();
  const latest = allExes[0] || null;
  const older = allExes.slice(1);

  let latestHtml = '';
  if (latest) {
    const stat = fs.statSync(path.join(DIST_DIR, latest));
    latestHtml = `
      <div class="file-info">
        <div class="file-name">${latest}</div>
        <div class="file-meta">${formatSize(stat.size)} &middot; ${stat.mtime.toLocaleDateString('pt-BR')}</div>
      </div>
      <a href="/download/${encodeURIComponent(latest)}" class="btn-download">Baixar Replay v${extractVersion(latest)}</a>
    `;
  } else {
    latestHtml = '<p class="no-file">Nenhum build disponivel.</p>';
  }

  let olderHtml = '';
  if (older.length > 0) {
    const rows = older.map(f => {
      const stat = fs.statSync(path.join(DIST_DIR, f));
      const ver = extractVersion(f);
      return `
        <tr>
          <td>v${ver}</td>
          <td>${stat.mtime.toLocaleDateString('pt-BR')}</td>
          <td>${formatSize(stat.size)}</td>
          <td><a href="/download/${encodeURIComponent(f)}">Baixar</a></td>
        </tr>`;
    }).join('');

    olderHtml = `
      <div class="older-section">
        <div class="older-title">Versoes anteriores</div>
        <table class="older-table">
          <thead><tr><th>Versao</th><th>Data</th><th>Tamanho</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
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
      max-width: 480px;
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
    .older-section {
      margin-top: 32px;
      text-align: left;
    }
    .older-title {
      font-size: 12px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
      text-align: center;
    }
    .older-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .older-table th {
      color: #555;
      font-weight: 600;
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid #0f3460;
    }
    .older-table td {
      padding: 6px 8px;
      color: #8b949e;
      border-bottom: 1px solid #0d1117;
    }
    .older-table a {
      color: #7ec8e3;
      text-decoration: none;
      font-size: 12px;
    }
    .older-table a:hover { color: #fff; text-decoration: underline; }
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
    ${latestHtml}
    ${olderHtml}
    <div class="footer">Windows 10/11 &middot; Instalador com wizard</div>
  </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  // Download de um arquivo especifico: /download/Replay-Setup-1.0.0.exe
  if (req.url.startsWith('/download/')) {
    const fileName = decodeURIComponent(req.url.slice('/download/'.length));
    // Sanitizar: apenas permitir arquivos .exe dentro de dist/
    if (!fileName.match(/^Replay[\w\-. ]+\.exe$/) || fileName.includes('..')) {
      res.writeHead(400);
      res.end('Nome de arquivo invalido');
      return;
    }
    const filePath = path.join(DIST_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Arquivo nao encontrado');
      return;
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Pagina principal
  if (req.url === '/' || req.url === '/index.html') {
    const html = renderPage();
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
