# replay - Memoria do Projeto

> **Referencia**: Este projeto segue o template documentado em [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md)

<!-- CHAPTER: 1 Visao Geral -->

## Sobre o Projeto

[Descricao do projeto a ser preenchida]

## Informacoes Principais

**Versao Atual**: v0.1.0
**Stack**: [A definir]
**Status**: Em desenvolvimento

<!-- CHAPTER: 2 Arquitetura -->

## Arquitetura

### Stack Tecnologico
- [A definir]

### Estrutura de Arquivos
```
replay/
├── .claude/
│   ├── memory.md
│   ├── commands/ → symlink
│   ├── settings.local.json → symlink
│   └── GUIA_AMBIENTES.md → symlink
├── config/
│   ├── .env                    # Config do ambiente DESTA branch
│   └── env.config.js           # Loader central
├── scripts/
│   ├── load-env.sh
│   └── backup-prod-db.sh
├── backups/
├── documentacao/
├── README.md
└── [arquivos do projeto]
```

<!-- CHAPTER: 3 Ambientes (CRITICO) -->

## Ambientes - ISOLAMENTO TOTAL

> **DOCUMENTO CRITICO**: Leia [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) para regras completas.

### Principio: Cada branch = um ambiente COMPLETAMENTE isolado

Codigo, banco, servicos, portas - TUDO e independente entre branches.
Alterar dev NAO afeta stage. Alterar stage NAO afeta producao.

| Branch | Ambiente | Prefixo | DB | Backend | Frontend |
|--------|----------|---------|-----|---------|----------|
| dev | Desenvolvimento | dev_ | dev_replay | :5001 | :3000 |
| stage | Pre-producao | stage_ | stage_replay | :5101 | :3100 |
| main | Producao | *(nenhum)* | replay | :5201 | :3200 |

### Regras OBRIGATORIAS de Producao

1. **NUNCA editar codigo diretamente na branch main**
2. **Commit antes de qualquer alteracao** em producao
3. **Backup do banco** antes de alteracoes em schema/dados
4. **Analise de impacto** apresentada e aprovada pelo usuario
5. **Dados NAO transitam** para producao - apenas estrutura e codigo
6. **Nada hardcoded** - todo valor de ambiente vem de `config/env.config.js`

### Fluxo de Promocao (merge entre branches)

```
branch dev ──(merge)──> branch stage ──(merge + aprovacao)──> branch main
```

<!-- CHAPTER: 4 Funcionalidades -->

## Funcionalidades

### Implementadas
- [A ser implementado]

### Em Desenvolvimento
- [A ser planejado]

<!-- CHAPTER: 5 Configuracoes -->

## Configuracoes

**Configuracao do ambiente**: `config/.env` (diferente em cada branch)
**Loader**: `config/env.config.js`
**Branch atual**: verificar com `git branch --show-current`

<!-- CHAPTER: 6 Troubleshooting -->

## Troubleshooting

### Problema 1
[A documentar conforme problemas aparecerem]

<!-- CHAPTER: 7 Proximas Features -->

## Proximas Funcionalidades

- [ ] [Feature 1]
- [ ] [Feature 2]

<!-- CHAPTER: 8 Referencias -->

## Referencias

- [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md) - Template de organizacao
- [GUIA_SISTEMA_PROJETOS.md](.claude/GUIA_SISTEMA_PROJETOS.md) - Guia do sistema
- [GUIA_AMBIENTES.md](.claude/GUIA_AMBIENTES.md) - **Guia de ambientes (CRITICO)**

---

**Ultima Atualizacao**: 2026-03-23
**Versao**: 0.1.0
**Status**: Em desenvolvimento
