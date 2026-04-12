// server/api-server.js
// Backend API do Replay - OCR de fichas de frequencia via Claude CLI
// Roda em http://localhost:BACKEND_PORT (config/.env)

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Config do ambiente
require(path.join(__dirname, '..', 'config', 'env.config.js'));
const { getCredential } = require('/home/cazouvilela/credenciais/credentials.js');

const PORT = parseInt(process.env.BACKEND_PORT) || 5204;
const API_TOKEN = getCredential('apps/replay.env', 'REPLAY_API_TOKEN');

const app = express();
app.use(cors());
app.use(express.json());

// Upload: imagens ate 20MB, salvas em /tmp com extensao correta
const storage = multer.diskStorage({
  destination: '/tmp',
  filename: (req, file, cb) => {
    const extMap = { 'image/jpeg': '.jpeg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };
    const ext = extMap[file.mimetype] || '.jpeg';
    cb(null, `replay-ocr-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
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

// Prompt OCR para o Claude CLI
const PROMPT_OCR = `{ULTRATHINK} Faca o OCR da tabela nessa imagem com maxima precisao. Analise cada linha com cuidado.

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
 * Executa o Claude CLI para processar OCR de uma imagem.
 * Usa a assinatura Max do usuario (sem custo extra de API).
 */
function executeClaude(imagePath) {
  return new Promise((resolve, reject) => {
    const prompt = `Leia a imagem no caminho ${imagePath} usando a ferramenta Read. Depois analise o conteudo.\n\n${PROMPT_OCR}`;
    const claudeBin = process.env.CLAUDE_BIN || '/home/cazouvilela/.npm-global/bin/claude';

    const args = [
      '-p',
      '--output-format', 'json',
      '--model', 'opus',
      '--effort', 'max',
      '--tools', 'Read',
      '--no-chrome',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
    ];

    console.log(`[OCR] Executando claude CLI para: ${imagePath}`);
    const startTime = Date.now();

    const child = spawn(claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: '/home/cazouvilela', PATH: process.env.PATH + ':/home/cazouvilela/.npm-global/bin' },
    });

    // Timeout manual de 10 minutos (opus pode demorar)
    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, 600000);

    // Enviar prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[OCR] Claude CLI finalizado em ${elapsed}s (code: ${code})`);

      if (code !== 0 && !stdout.includes('"type":"result"')) {
        console.error(`[OCR] Stderr: ${stderr.substring(0, 300)}`);
        return reject(new Error(`Claude CLI saiu com codigo ${code}`));
      }

      try {
        // A saida do claude --output-format json e uma linha JSON por evento
        // Procurar o objeto com type:"result"
        const lines = stdout.trim().split('\n');
        let resultText = null;

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'result') {
              resultText = parsed.result;
              break;
            }
          } catch {
            // Ignorar linhas nao-JSON
          }
        }

        // Fallback: tentar parsear como JSON array
        if (!resultText) {
          try {
            const fullParsed = JSON.parse(stdout);
            const arr = Array.isArray(fullParsed) ? fullParsed : [fullParsed];
            const resultObj = arr.find(o => o.type === 'result');
            if (resultObj) resultText = resultObj.result;
          } catch {
            // Nao e JSON valido
          }
        }

        if (!resultText) {
          console.error(`[OCR] Stdout (inicio): ${stdout.substring(0, 500)}`);
          return reject(new Error('Resposta do Claude nao contem resultado'));
        }

        console.log(`[OCR] Result text (inicio): ${resultText.substring(0, 500)}`);

        // Extrair JSON da resposta (pode ter texto ao redor, markdown fences, etc.)
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error(`[OCR] Result text completo: ${resultText}`);
          return reject(new Error('Resposta do Claude nao contem JSON valido'));
        }

        const ocrData = JSON.parse(jsonMatch[0]);
        ocrData._meta = {
          tempoProcessamento: `${elapsed}s`,
          modelo: 'sonnet',
        };
        resolve(ocrData);
      } catch (parseErr) {
        console.error(`[OCR] Erro ao parsear: ${parseErr.message}`);
        console.error(`[OCR] Stdout (inicio): ${stdout.substring(0, 500)}`);
        reject(new Error(`Erro ao interpretar resposta do OCR: ${parseErr.message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Falha ao iniciar Claude CLI: ${err.message}`));
    });
  });
}

// ==================== ROTAS ====================

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'replay-api', timestamp: new Date().toISOString() });
});

// OCR de ficha de frequencia
// Envia keepalive (espacos) a cada 15s para evitar timeout 524 do Cloudflare
app.post('/api/ocr', authMiddleware, upload.single('imagem'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada. Use o campo "imagem".' });
  }

  const tempPath = req.file.path;
  console.log(`[OCR] Recebido: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB, ${req.file.mimetype})`);

  // Iniciar resposta chunked com keepalive para evitar Cloudflare 524
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Accel-Buffering', 'no');
  const keepalive = setInterval(() => { res.write(' '); }, 15000);

  try {
    const data = await executeClaude(tempPath);
    clearInterval(keepalive);
    res.end(JSON.stringify({ success: true, data }));
  } catch (err) {
    clearInterval(keepalive);
    console.error(`[OCR] Falha: ${err.message}`);
    res.end(JSON.stringify({ success: false, error: err.message }));
  } finally {
    fs.unlink(tempPath, () => {});
  }
});

// Erro de upload (arquivo muito grande, tipo invalido)
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
  console.log(`  POST /api/ocr  - OCR de fichas de frequencia`);
  console.log(`  GET  /health   - Healthcheck`);
});
