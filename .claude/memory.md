# replay - Memoria do Projeto

> **Referencia**: Este projeto segue o template documentado em [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md)

<!-- CHAPTER: 1 Visao Geral -->

## Sobre o Projeto

Aplicacao para extrair dados da agenda do ZenFisio (https://app.zenfisio.com/calendar) e gerar planilha Excel (.xlsx) com detalhes de agendamentos.

## Informacoes Principais

**Versao Atual**: v0.1.0
**Stack**: Electron 33 + Node 22 + ExcelJS + Playwright (CLI)
**Status**: Funcional - extracao testada e validada (2026-03-23)
**Repo**: https://github.com/CazouVilela/replay

<!-- CHAPTER: 2 Arquitetura -->

## Arquitetura

### Stack Tecnologico
- **Electron 33** - app desktop com webview para ZenFisio
- **ExcelJS** - geracao de planilhas Excel
- **Playwright** - versao CLI headless (debug)
- **electron-builder** - build Windows (.exe) e Linux (.AppImage)

### Estrutura de Arquivos
```
replay/
├── desktop/
│   ├── main.js          # Electron main process (IPC: save-excel, save-debug)
│   ├── preload.js       # Bridge IPC seguro
│   ├── index.html       # UI: toolbar + webview + log panel
│   ├── style.css        # Dark theme
│   └── app.js           # Logica de scraping (seletores mapeados do DOM real)
├── src/
│   └── index.js         # Versao CLI (Playwright headless)
├── server/
│   └── download-server.js  # Serve .exe na porta 9080
├── debug/
│   ├── cdp-exec.js      # Helper para executar JS via CDP
│   └── *.png            # Screenshots de debug
├── dist/
│   ├── Replay-0.1.0.exe      # Build Windows (73MB)
│   └── Replay-0.1.0.AppImage # Build Linux (112MB)
├── config/
│   ├── .env
│   └── env.config.js
└── scripts/
```

### Builds
- Windows: `npm run build:win` → `dist/Replay-0.1.0.exe`
- Linux: `npm run build:linux` → `dist/Replay-0.1.0.AppImage`
- Dev direto: `npm start` (requer DISPLAY)
- Debug com CDP: `npx electron desktop/main.js --no-sandbox --remote-debugging-port=9222`

<!-- CHAPTER: 3 Ambientes (CRITICO) -->

## Ambientes - ISOLAMENTO TOTAL

> **DOCUMENTO CRITICO**: Leia [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) para regras completas.

### Principio: Cada branch = um ambiente COMPLETAMENTE isolado

| Branch | Ambiente | Prefixo | DB | Backend | Frontend |
|--------|----------|---------|-----|---------|----------|
| dev | Desenvolvimento | dev_ | dev_replay | :5001 | :3000 |
| stage | Pre-producao | stage_ | stage_replay | :5101 | :3100 |
| main | Producao | *(nenhum)* | replay | :5201 | :3200 |

<!-- CHAPTER: 4 Funcionalidades -->

## Funcionalidades

### Implementadas
- Login manual no ZenFisio via webview (Cloudflare Turnstile requer humano)
- Extracao automatica: seleciona todos profissionais, lista do dia, navega por datas
- Extrai: data, horario, profissional, especialidade, paciente, valor, pago, data pgto
- Geracao de planilha Excel (.xlsx) com formatacao e filtros
- Servidor de download em replay.sistema.cloud (Cloudflare tunnel)
- Build para Windows (.exe) e Linux (.AppImage)

### Fluxo de Extracao
1. Usuario faz login manual (Turnstile impede bot)
2. Seleciona periodo (data inicio/fim)
3. App clica "Selecionar todos" profissionais
4. Muda para view "Lista do dia"
5. Para cada dia: clica cada evento → popover → editar → extrai campos do modal
6. Gera Excel no final

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
| Fechar modal | `#modalScheduling [data-dismiss="modal"]` |
| Dia anterior | `.fc-prev-button` |
| Proximo dia | `.fc-next-button` |

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

<!-- CHAPTER: 7 Proximas Features -->

## Proximas Funcionalidades

- [ ] Melhorar navegacao de datas (usar FullCalendar API se possivel)
- [ ] Tratar dias sem agendamentos na navegacao
- [ ] Adicionar barra de progresso visual
- [ ] Salvar Excel automaticamente (sem dialogo) na versao CLI

<!-- CHAPTER: 8 Infra -->

## Infraestrutura

### Servidor de Download
- Systemd: `replay-download.service`
- URL: https://replay.sistema.cloud
- Rota no Cloudflare tunnel config (local + remoto)

### Cloudflare
- Tunnel config remota sobrescreve local - atualizar AMBAS
- Token CF_API_TOKEN tem permissao para atualizar config via API

<!-- CHAPTER: 9 Referencias -->

## Referencias

- [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md) - Template de organizacao
- [GUIA_SISTEMA_PROJETOS.md](.claude/GUIA_SISTEMA_PROJETOS.md) - Guia do sistema
- [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) - **Guia de ambientes (CRITICO)**

---

**Ultima Atualizacao**: 2026-03-23
**Versao**: 0.1.0
**Status**: Funcional - extracao validada
