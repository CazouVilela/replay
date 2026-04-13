// server/api-server.js
// Backend API do Replay - OCR de fichas de frequencia via Gemini Flash
// Tier gratuito do Google AI Studio (15 req/min, 1M tokens/dia)
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
const GEMINI_KEY = getCredential('api_tokens/gemini.env', 'GEMINI_API_KEY');

const app = express();
app.use(cors());
app.use(express.json());

// Upload: imagens ate 20MB em memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
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
  if (auth.slice(7) !== API_TOKEN) {
    return res.status(403).json({ success: false, error: 'Token invalido' });
  }
  next();
}

// Prompt OCR
const PROMPT_OCR = `Faca o OCR da tabela nessa imagem e retorne os dados como JSON.

Coluna assinatura — campo Sim ou Nao:
- true APENAS se existir uma assinatura real (nome, rubrica, rabisco intencional) naquela linha
- false se a linha estiver vazia, em branco, ou tiver apenas um traco/risco que seja extrapolacao/continuacao de assinaturas de outras linhas

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
 * Chama Gemini 2.5 Flash via API REST direta.
 * Tier gratuito: 15 req/min, 1M tokens/dia.
 */
async function processOcr(imageBuffer, mimeType) {
  const b64 = imageBuffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64 } },
        { text: PROMPT_OCR },
      ],
    }],
  });

  const startTime = Date.now();
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[OCR] Gemini Flash tentativa ${attempt}/${maxRetries}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const result = await response.json();

    if (result.error) {
      if (result.error.code === 429 && attempt < maxRetries) {
        const wait = attempt * 10;
        console.log(`[OCR] Rate limit. Aguardando ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[OCR] Erro Gemini (${elapsed}s):`, result.error.message);
      throw new Error(result.error.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[OCR] Resposta sem texto:', JSON.stringify(result).substring(0, 300));
      throw new Error('Gemini retornou resposta vazia');
    }

    console.log(`[OCR] Gemini respondeu em ${elapsed}s`);

    // Extrair JSON (pode ter markdown fences)
    let cleanText = text.trim();
    if (cleanText.startsWith('```')) {
      const lines = cleanText.split('\n');
      cleanText = lines.slice(1, lines[lines.length - 1].trim() === '```' ? -1 : undefined).join('\n');
    }

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[OCR] Sem JSON:', cleanText.substring(0, 300));
      throw new Error('Resposta nao contem JSON valido');
    }

    const ocrData = JSON.parse(jsonMatch[0]);
    ocrData._meta = {
      tempoProcessamento: `${elapsed}s`,
      modelo: 'gemini-2.5-flash',
    };
    return ocrData;
  }

  throw new Error('Rate limit persistente. Tente novamente em alguns minutos.');
}

// ==================== ROTAS ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'replay-api', timestamp: new Date().toISOString() });
});

app.post('/api/ocr', authMiddleware, upload.single('imagem'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada. Use o campo "imagem".' });
  }

  console.log(`[OCR] Recebido: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB, ${req.file.mimetype})`);

  try {
    const data = await processOcr(req.file.buffer, req.file.mimetype);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[OCR] Falha: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload: ${err.message}` });
  }
  if (err.message?.includes('Tipo de arquivo')) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next(err);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Replay API rodando em http://localhost:${PORT}`);
  console.log(`  POST /api/ocr  - OCR via Gemini 2.5 Flash (gratuito)`);
  console.log(`  GET  /health   - Healthcheck`);
});
