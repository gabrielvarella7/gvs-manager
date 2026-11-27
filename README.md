# GVS Score Manager

App web (PT-BR) para acompanhar acertos e desempenho em estudos para concursos: **matéria → tópico → assunto**, histórico de exercícios e **ACUMULADO U20**.

## Como rodar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Em desenvolvimento a identidade é simulada (`cursor/identity.dev.ts`) e os dados ficam em PGlite em memória. No app publicado (Cursor), a conta sincroniza via Postgres + identidade Cursor.

## Scripts

- `npm run dev` — desenvolvimento
- `npm run build` — build + migrate (quando `DATABASE_URL` existir)
- `npm start` — servidor de produção

## Escopo MVP

Perfis por concurso, CRUD de estrutura (sem placeholders), médias simples (U20 / tópico / matéria) e cores ≥70% verde / &lt;70% vermelho claro.
