// server/api-server.js
// Backend API do Replay - OCR de fichas de frequencia via API direta
// Usa OAuth token da assinatura Max (zero custo extra)
// Roda em http://localhost:BACKEND_PORT (config/.env)

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Config do ambiente
require(path.join(__dirname, '..', 'config', 'env.config.js'));
const { getCredential } = require('/home/cazouvilela/credenciais/credentials.js');

const PORT = parseInt(process.env.BACKEND_PORT) || 5204;
const API_TOKEN = getCredential('apps/replay.env', 'REPLAY_API_TOKEN');
const CREDENTIALS_FILE = '/home/cazouvilela/.claude/.credentials.json';

const app = express();
app.use(cors());
app.use(express.json());

// Upload: imagens ate 20MB em memoria (sem salvar em disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo nao suportado: ${file.mimetype}`));
    }
  },
});

// Middleware de autenticacao
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de autenticacao ausente' });
  }
  const token = auth.slice(7);
  if (token !== API_TOKEN) {
    return res.status(403).json({ success: false, error: 'Token invalido' });
  }
  next();
}

// Prompt OCR
const PROMPT_OCR = `Faca o OCR da tabela nessa imagem e retorne os dados como JSON.

Na coluna assinatura: true se existe uma assinatura, false se nao existe.
Se nao tiver certeza de algum campo, adicione "?" no final do valor.

Retorne APENAS o JSON puro, sem markdown e sem texto adicional:

{
  "paciente": "nome do paciente",
  "periodo": "MM/AAAA a MM/AAAA",
  "registros": [
    {"data": "DD/MM/AAAA", "modalidade": "texto visivel", "assinatura": true}
  ]
}`;

/**
 * Le o token OAuth da assinatura Max do Claude Code.
 */
function getOAuthToken() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  const oauth = creds.claudeAiOauth;
  if (!oauth || !oauth.accessToken) {
    throw new Error('Token OAuth nao encontrado em ~/.claude/.credentials.json');
  }
  return oauth.accessToken;
}

/**
 * Chama a API Anthropic diretamente com OAuth token.
 * Uma unica chamada com imagem base64 — igual ao app desktop.
 * Retry automatico em caso de rate limit (429), como o Claude Code faz.
 */
async function processOcr(imageBuffer, mimeType) {
  const token = getOAuthToken();
  const b64 = imageBuffer.toString('base64');

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20',
    'Authorization': `Bearer ${token}`,
  };

  const body = JSON.stringify({
    model: 'claude-opus-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
        { type: 'text', text: PROMPT_OCR },
      ],
    }],
  });

  const startTime = Date.now();
  const maxRetries = 8;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[OCR] Opus tentativa ${attempt}/${maxRetries}...`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body,
    });

    const result = await response.json();

    if (result.error) {
      if (result.error.type === 'rate_limit_error' && attempt < maxRetries) {
        // Espera progressiva: 10, 20, 30, 40, 50, 60, 60s
        const wait = Math.min(attempt * 10, 60);
        console.log(`[OCR] Rate limit. Aguardando ${wait}s (tentativa ${attempt})...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[OCR] Erro API (${elapsed}s):`, result.error);
      throw new Error(result.error.message || JSON.stringify(result.error));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[OCR] Opus respondeu em ${elapsed}s`);

    const text = result.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[OCR] Resposta sem JSON:', text.substring(0, 300));
      throw new Error('Resposta nao contem JSON valido');
    }

    const ocrData = JSON.parse(jsonMatch[0]);
    ocrData._meta = {
      tempoProcessamento: `${elapsed}s`,
      modelo: result.model,
    };
    return ocrData;
  }

  throw new Error('Opus com rate limit persistente. Tente novamente em alguns minutos.');
}

// ==================== ROTAS ====================

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'replay-api', timestamp: new Date().toISOString() });
});

// OCR de ficha de frequencia
app.post('/api/ocr', authMiddleware, upload.single('imagem'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada. Use o campo "imagem".' });
  }

  console.log(`[OCR] Recebido: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB, ${req.file.mimetype})`);

  // Keepalive para Cloudflare (evita timeout 524)
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Accel-Buffering', 'no');
  const keepalive = setInterval(() => { res.write(' '); }, 15000);

  try {
    const data = await processOcr(req.file.buffer, req.file.mimetype);
    clearInterval(keepalive);
    res.end(JSON.stringify({ success: true, data }));
  } catch (err) {
    clearInterval(keepalive);
    console.error(`[OCR] Falha: ${err.message}`);
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
});

// Erro de upload
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload: ${err.message}` });
  }
  if (err.message && err.message.includes('Tipo de arquivo')) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next(err);
});

// ==================== INICIO ====================

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Replay API rodando em http://localhost:${PORT}`);
  console.log(`  POST /api/ocr  - OCR via API direta (OAuth Max)`);
  console.log(`  GET  /health   - Healthcheck`);
});
