# replay - Memoria do Projeto

> **Referencia**: Este projeto segue o template documentado em [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md)

<!-- CHAPTER: 1 Visao Geral -->

## Sobre o Projeto

Aplicacao para extrair dados da agenda do ZenFisio (https://app.zenfisio.com/calendar) e gerar planilha Excel (.xlsx) com detalhes de agendamentos. Inclui OCR de fichas de frequencia de terapias via Gemini 2.5 Flash.

## Informacoes Principais

**Versao Atual**: v2.0.1
**Stack**: Electron 33 + Express 5.2 + Gemini 2.5 Flash + ExcelJS + Playwright (CLI)
**Status**: Funcional - extracao + OCR validados (2026-04-12)
**Repo**: https://github.com/CazouVilela/replay

<!-- CHAPTER: 2 Arquitetura -->

## Arquitetura

### Stack Tecnologico
- **Electron 33** - app desktop com webview para ZenFisio
- **Express 5.2.1** - backend API para OCR
- **Gemini 2.5 Flash** - OCR de fichas de frequencia (tier gratuito Google AI Studio, 15 req/min)
- **Multer 2.1.1** - upload de imagens no backend (ate 20MB)
- **ExcelJS 4.4.0** - geracao de planilhas Excel
- **Playwright 1.58.2** - versao CLI headless (debug/desenvolvimento)
- **electron-builder 25.1.8 + NSIS** - build Windows (instalador com wizard e limpeza)

### Estrutura de Arquivos
```
replay/
├── desktop/
│   ├── main.js          # Electron main process (IPC: save-excel, load-price-table, process-ocr-image, save-debug)
│   ├── preload.js       # Bridge IPC seguro (4 handlers expostos)
│   ├── index.html       # UI: toolbar + webview + painel OCR + log panel
│   ├── style.css        # Dark theme (com estilos OCR: incerteza, editado, assinatura)
│   └── app.js           # Logica de scraping + OCR UI + validacao de precos
├── src/
│   └── index.js         # Versao CLI (Playwright headless) - debug/desenvolvimento
├── server/
│   ├── api-server.js    # Backend API Express: POST /api/ocr (Gemini 2.5 Flash), GET /health
│   ├── download-server.js  # Serve instaladores .exe na porta 9080 (listagem de versoes)
│   ├── ocr-gemini.py    # Script standalone: OCR via Google GenAI SDK (Python 3.13)
│   └── ocr-hibrido.py   # Script standalone: OCR via EasyOCR + analise de pixels (Python 3.13)
├── config/
│   ├── .env             # Variaveis de ambiente da branch atual
│   └── env.config.js    # Loader central de configuracao
├── installer/
│   └── nsis-cleanup.nsh # Limpeza de cache e versoes antigas no instalador NSIS
├── scripts/
│   ├── backup-prod-db.sh  # Backup de banco de producao (template)
│   └── load-env.sh        # Source de variaveis de ambiente
├── arquivos_auxiliares/   # Fichas de frequencia de exemplo para teste OCR
├── arquivos_gerados/      # Builds .exe versionados (v1.0.0 a v2.0.1)
├── debug/
│   ├── cdp-exec.js      # Helper para executar JS via CDP (WebSocket)
│   └── *.png            # Screenshots de debug
└── dist/                # Output do electron-builder (gitignored)
```

### Servidores

| Servidor | Arquivo | Porta (dev) | URL Publica | Systemd |
|----------|---------|-------------|-------------|---------|
| Backend API (OCR) | server/api-server.js | 5004 | https://replay-api.sistema.cloud | replay-backend |
| Download Server | server/download-server.js | 9080 | https://replay.sistema.cloud | replay-download |

### Builds
- Windows: `npm run build:win` → instalador NSIS com wizard (`Replay-Setup-{version}.exe`)
- Linux: `npm run build:linux` → AppImage
- Dev direto: `npm start` (requer DISPLAY)
- Backend dev: `npm run server` (api-server.js)
- Debug com CDP: `npx electron desktop/main.js --no-sandbox --remote-debugging-port=9222`

### Credenciais
- Loader central: `/home/cazouvilela/credenciais/credentials.js`
- `REPLAY_API_TOKEN` → `apps/replay.env` (autenticacao Bearer no backend)
- `GEMINI_API_KEY` → `api_tokens/gemini.env` (API Google AI Studio)

<!-- CHAPTER: 3 Ambientes (CRITICO) -->

## Ambientes - ISOLAMENTO TOTAL

> **DOCUMENTO CRITICO**: Leia [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) para regras completas.

### Principio: Cada branch = um ambiente COMPLETAMENTE isolado

| Branch | Ambiente | Prefixo | DB | Backend | Frontend |
|--------|----------|---------|-----|---------|----------|
| dev | Desenvolvimento | dev_ | dev_replay | :5004 | :3004 |
| stage | Pre-producao | stage_ | stage_replay | :5104 | :3104 |
| main | Producao | *(nenhum)* | replay | :5204 | :3204 |

**Download server**: porta fixa 9080 (todos os ambientes).

<!-- CHAPTER: 4 Funcionalidades -->

## Funcionalidades

### Implementadas
- Login manual no ZenFisio via webview (Cloudflare Turnstile requer humano)
- Extracao automatica: seleciona todos profissionais, lista do dia, navega por datas
- Navegacao robusta: pula finais de semana, detecta overshoot, aceita data mais proxima
- Extrai: data, horario, profissional, especialidade, paciente, valor, pago, data pgto, **status, convenio**
- **Tabela de precos**: upload de .xlsx com precos por paciente/especialidade, validacao automatica
- **Coluna Inconsistencias**: divergencias vs tabela (maior/menor que tabela, sem tabela, sem valor)
- Geracao de planilha Excel (.xlsx) com formatacao, filtros e **aba Recebimentos**
- **Aba Recebimentos**: agrupamento por paciente (Total, Recebidos, A receber, Agendamentos futuros) com colunas dinamicas por profissional
- **OCR de fichas de frequencia** via Gemini 2.5 Flash (tier gratuito, ~15s por imagem)
- **Indicadores visuais de incerteza** no OCR (campos com "?" destacados em vermelho)
- **Campos editaveis** nos resultados OCR + toggle de assinatura (Sim/Nao clicavel)
- Servidor de download em replay.sistema.cloud (Cloudflare tunnel) com listagem de versoes anteriores
- Build para Windows (.exe com instalador NSIS e limpeza de cache) e Linux (.AppImage)

### Fluxo de Extracao
1. Usuario faz login manual (Turnstile impede bot)
2. Seleciona periodo (data inicio/fim)
3. (Opcional) Carrega tabela de precos (.xlsx)
4. App clica "Selecionar todos" profissionais
5. Muda para view "Lista do dia"
6. Para cada dia: clica cada evento → popover → editar → extrai campos do modal
7. Valida valores contra tabela de precos (se carregada)
8. Gera Excel com aba Agendamentos + aba Recebimentos

### Fluxo OCR de Fichas
1. Usuario clica "Frequencia (OCR)" e seleciona imagem (JPEG/PNG/WebP, ate 20MB)
2. Imagem enviada via IPC → main.js → backend (multipart POST /api/ocr com Bearer token)
3. Backend envia para Gemini 2.5 Flash com prompt estruturado
4. Resposta parseada como JSON (paciente, periodo, registros com data/modalidade/assinatura)
5. Resultados exibidos em tabela editavel no painel inferior

<!-- CHAPTER: 5 Seletores ZenFisio (CRITICO) -->

## Seletores do DOM ZenFisio (mapeados 2026-03-23)

**IMPORTANTE**: Os `name` dos inputs sao RANDOMIZADOS (anti-scraping). Usar SEMPRE `id`.
**IMPORTANTE**: Existem note-popovers do Summernote. Filtrar popover por `textContent.includes('Paciente')`.

| Elemento | Seletor |
|----------|---------|
| Selecionar todos profissionais | `a.select-all-users-calendar` |
| Lista do dia | `.fc-listDay-button` |
| Eventos na lista | `tr.fc-list-event` |
| Tempo do evento | `td.fc-list-event-time` |
| Titulo do evento | `td.fc-list-event-title a` |
| Cabecalho do dia | `tr.fc-list-day` (attr `data-date`) |
| Popover agendamento | `.popover.in` (filtrar: contem "Paciente", nao e note-popover) |
| Link paciente | `a[href*="/patients/"]` |
| Botao editar | `a.btn-edit-event` |
| Modal edicao | `#modalScheduling` (classe `in` quando visivel) |
| Data | `#datepicker` |
| Hora inicio | `#start` |
| Hora fim | `#end` |
| Profissional | `#user` (select2, formato: "Nome (Especialidade)") |
| Paciente | `#autocomplete_patient_calendar` |
| Valor | `#value` (formato: "150,00") |
| Pago | `#paid_out` (checkbox) |
| Data pagamento | `#date_payment` |
| **Status** | `#status` (select: "Agendado", "Atendido", etc.) |
| **Convenio** | `#agreement` (select: "Particular", etc.) |
| Fechar modal | `#modalScheduling [data-dismiss="modal"]` |
| Dia anterior | `.fc-prev-button` |
| Proximo dia | `.fc-next-button` |
| Titulo da data | `.fc-toolbar-title` (formato: "24 de marco de 2026") |

<!-- CHAPTER: 6 Troubleshooting -->

## Troubleshooting

### Cloudflare Turnstile
- Headless Playwright NAO passa no Turnstile
- Electron funciona porque e Chromium real com interacao manual
- Sessao persiste em cookies do Electron (reiniciar app NAO perde login)

### Debug no Linux
- Rodar com `--remote-debugging-port=9222` para inspecionar via CDP
- Helper: `debug/cdp-exec.js` executa JS no webview via WebSocket
- Uso: `node debug/cdp-exec.js "ws://localhost:9222/devtools/page/ID" "codigo_js"`

### Multiplos Popovers
- ZenFisio usa Summernote (editor rich text) que cria note-popovers
- Ao buscar `.popover.in`, filtrar por conteudo (deve ter "Paciente")

### OCR
- Timeout de 10 minutos no client (main.js req.setTimeout 600000)
- Retry automatico em rate limit 429 (ate 3 tentativas, backoff 10s/20s/30s)
- Resposta pode conter markdown fences (```json ... ```) - parser remove automaticamente
- Campos incertos marcados com "?" pelo modelo

<!-- CHAPTER: 7 Proximas Features -->

## Proximas Funcionalidades

- [ ] Exportar resultados OCR para Excel
- [ ] Cruzar dados OCR com dados extraidos da agenda (reconciliacao)
- [ ] Batch OCR (multiplas fichas de uma vez)

<!-- CHAPTER: 8 Infra -->

## Infraestrutura

### Backend API (OCR)
- Systemd: `replay-backend.service`
- URL: https://replay-api.sistema.cloud
- Endpoint principal: `POST /api/ocr` (imagem → JSON via Gemini)
- Healthcheck: `GET /health`
- Auth: Bearer token (REPLAY_API_TOKEN)

### Servidor de Download
- Systemd: `replay-download.service`
- URL: https://replay.sistema.cloud
- Pagina HTML com versao atual + listagem de versoes anteriores
- Builds lidos de `dist/` (apenas arquivos .exe Setup)

### Cloudflare
- Tunnel config remota sobrescreve local - atualizar AMBAS
- Token CF_API_TOKEN tem permissao para atualizar config via API
- Rotas: `replay-api.sistema.cloud` → localhost:5004, `replay.sistema.cloud` → localhost:9080

### API OCR - Gemini 2.5 Flash
- Tier gratuito Google AI Studio: 15 req/min, 1M tokens/dia
- Modelo: `gemini-2.5-flash` via REST (`generativelanguage.googleapis.com/v1beta`)
- Imagens suportadas: JPEG, PNG, WebP (ate 20MB)

<!-- CHAPTER: 9 Historico de Versoes -->

## Historico de Versoes

| Versao | Data | Descricao |
|--------|------|-----------|
| 2.0.1 | 2026-04-12 | Fix: botao OCR travava apos primeiro upload + prompt assinatura |
| 2.0.0 | 2026-04-12 | OCR via Gemini 2.5 Flash (gratuito, ~15s) |
| 1.1.x | 2026-04 | OCR via Claude (descontinuado), indicadores de incerteza |
| 1.0.x | 2026-04 | Release OCR, download com versoes, keepalive Cloudflare |
| 0.1.0 | 2026-03 | Versao inicial: extracao de agenda, tabela de precos, recebimentos |

<!-- CHAPTER: 10 Referencias -->

## Referencias

- [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md) - Template de organizacao
- [GUIA_SISTEMA_PROJETOS.md](.claude/GUIA_SISTEMA_PROJETOS.md) - Guia do sistema
- [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) - **Guia de ambientes (CRITICO)**

---

**Ultima Atualizacao**: 2026-04-12
**Versao**: 2.0.1
**Status**: Funcional - extracao + OCR validados
