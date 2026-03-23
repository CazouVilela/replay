# replay

## Descricao
[Descricao do projeto]

## Ambientes (Isolamento Total via Branches)

Cada branch e um ambiente **completamente isolado** com codigo, banco, servicos e portas independentes.

| Branch | Ambiente | Banco | Backend | Frontend |
|--------|----------|-------|---------|----------|
| dev | Desenvolvimento | dev_replay | :5001 | :3000 |
| stage | Pre-producao | stage_replay | :5101 | :3100 |
| main | Producao | replay | :5201 | :3200 |

### Fluxo

```
branch dev ──(merge)──> branch stage ──(merge + aprovacao)──> branch main
```

### Configuracao

Cada branch tem seu `config/.env` com os valores do ambiente.
O codigo referencia `config/env.config.js` - NUNCA valores hardcoded.

Regras de ambientes em [`.claude/GUIA_AMBIENTES.md`](.claude/GUIA_AMBIENTES.md)

## Instalacao
[Instrucoes de instalacao]

## Uso
[Instrucoes de uso]
