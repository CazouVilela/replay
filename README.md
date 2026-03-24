# Replay - Extrator de Agenda ZenFisio

Aplicacao desktop (Windows) que extrai dados de agendamentos do ZenFisio e exporta para planilha Excel.

## Como usar

1. Execute `Replay-0.1.0.exe`
2. Faca login no ZenFisio na janela que abre
3. Selecione as datas de inicio e fim
4. Clique em **Iniciar Extracao**
5. Acompanhe o processo no painel de log
6. Salve o arquivo `.xlsx` quando solicitado

## Dados extraidos

Cada agendamento gera uma linha com:

| Coluna | Descricao |
|--------|-----------|
| Data | Data do agendamento |
| Horario | Hora do atendimento |
| Profissional | Nome do profissional |
| Especialidade | Especialidade (entre parenteses) |
| Paciente | Nome do paciente |
| Valor | Valor do atendimento |
| Pago | Status de pagamento |
| Data Pgto | Data do pagamento |

## Stack

- **Electron** - App desktop com Chromium embutido
- **ExcelJS** - Geracao de planilhas .xlsx
- **electron-builder** - Empacotamento como .exe portatil

## Desenvolvimento

```bash
npm install
npm start          # Rodar em modo dev
npm run build:win  # Gerar .exe para Windows
```

## Ambientes (Isolamento Total via Branches)

| Branch | Ambiente |
|--------|----------|
| dev | Desenvolvimento |
| stage | Pre-producao |
| main | Producao |

Fluxo: `dev -> stage -> main`
