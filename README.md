# Replay - Extrator de Dados ZenFisio

Aplicacao desktop (Windows) que extrai dados de agendamentos do ZenFisio e exporta para planilha Excel, com OCR de fichas de frequencia de terapias via Gemini 2.5 Flash.

## Como usar

1. Execute `Replay-Setup-2.0.1.exe` (instalador com wizard)
2. Faca login no ZenFisio na janela que abre
3. Selecione as datas de inicio e fim
4. (Opcional) Carregue uma **Tabela de Precos** (.xlsx) para validacao automatica de valores
5. Clique em **Iniciar Extracao**
6. Acompanhe o processo no painel de log
7. Salve o arquivo `.xlsx` quando solicitado

### OCR de Fichas de Frequencia

1. Clique em **Frequencia (OCR)** na toolbar
2. Selecione uma foto da ficha de frequencia (JPEG, PNG ou WebP)
3. Aguarde o processamento (~15s via Gemini 2.5 Flash)
4. Revise os dados no painel de resultados (campos editaveis, clique para alternar assinatura)

## Dados extraidos

### Aba Agendamentos

| Coluna | Descricao |
|--------|-----------|
| Data | Data do agendamento |
| Horario | Hora do atendimento |
| Profissional | Nome do profissional |
| Especialidade | Especialidade (entre parenteses) |
| Paciente | Nome do paciente |
| Valor | Valor do atendimento |
| Pago | Status de pagamento (Sim/Nao) |
| Data Pgto | Data do pagamento |
| Status | Status do agendamento |
| Convenio | Convenio do paciente |
| Inconsistencias | Divergencias vs tabela de precos (se carregada) |

### Aba Recebimentos

Gerada automaticamente com agrupamento por paciente:
- Total, Recebidos, A receber, Agendamentos futuros
- Colunas dinamicas por profissional

## Stack

- **Electron 33** - App desktop com Chromium embutido
- **Express 5** - Backend API (OCR)
- **Gemini 2.5 Flash** - OCR de fichas de frequencia (tier gratuito Google AI Studio)
- **ExcelJS** - Geracao de planilhas .xlsx
- **electron-builder + NSIS** - Instalador Windows com wizard e limpeza de cache

## Desenvolvimento

```bash
npm install
npm start          # Rodar Electron em modo dev
npm run server     # Rodar backend API (OCR)
npm run build:win  # Gerar instalador .exe para Windows
```

## Download

Pagina de download: https://replay.sistema.cloud

## Ambientes (Isolamento Total via Branches)

| Branch | Ambiente |
|--------|----------|
| dev | Desenvolvimento |
| stage | Pre-producao |
| main | Producao |

Fluxo: `dev -> stage -> main`
