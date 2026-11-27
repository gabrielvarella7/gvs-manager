/**
 * Local smoke test: PGlite + CREMERJ import (no production DATABASE_URL).
 * Usage: env -u DATABASE_URL node scripts/smoke-import-cremerj.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DATABASE_URL = "";
process.env.DATABASE_URL_UNPOOLED = "";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.chdir(root);

// Dynamic import of compiled-less TS via next isn't available; replicate with pg-lite SQL using the migrate files + JSON.
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const files = (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  await db.exec(await readFile(`migrations/${file}`, "utf8"));
  console.log("migrated", file);
}

const owner = "smoke-user";
const stage = "production";
const profile = (
  await db.query(
    `insert into profiles (owner_sub, stage, nome, concurso, cargo)
     values ($1, $2, $3, $4, $5) returning id, nome, concurso`,
    [owner, stage, "Gabriel", "CREMERJ", "Analista"],
  )
).rows[0];

const seed = [
  "Português",
  "RLM",
  "Informática",
  "CREMERJ",
  "Constitucional",
  "D Administrativo",
  "F Administração",
];
for (let i = 0; i < seed.length; i++) {
  await db.query(`insert into materias (profile_id, nome, sort_order) values ($1, $2, $3)`, [
    profile.id,
    seed[i],
    i,
  ]);
}

const payload = JSON.parse(await readFile("src/data/cremerj-import.json", "utf8"));
let created = { topicos: 0, assuntos: 0, historico: 0 };

for (const materia of payload.materias) {
  const m = (
    await db.query(
      `select id from materias where profile_id = $1 and lower(nome) = lower($2) limit 1`,
      [profile.id, materia.nome],
    )
  ).rows[0];
  if (!m) throw new Error(`missing materia ${materia.nome}`);
  for (const topico of materia.topicos) {
    const t = (
      await db.query(
        `insert into topicos (materia_id, nome, sort_order) values ($1, $2, $3) returning id`,
        [m.id, topico.nome, topico.sort_order],
      )
    ).rows[0];
    created.topicos++;
    for (const assunto of topico.assuntos) {
      const a = (
        await db.query(
          `insert into assuntos (topico_id, nome, sort_order) values ($1, $2, $3) returning id`,
          [t.id, assunto.nome, assunto.sort_order],
        )
      ).rows[0];
      created.assuntos++;
      for (const h of assunto.historico) {
        const pct = (h.acertos / h.quantidade) * 100;
        await db.query(
          `insert into historico (assunto_id, acertos, quantidade, percentual) values ($1,$2,$3,$4)`,
          [a.id, h.acertos, h.quantidade, pct],
        );
        created.historico++;
      }
    }
  }
}

await db.query(
  `insert into import_runs (profile_id, import_key, stats) values ($1, $2, $3::jsonb)`,
  [profile.id, "cremerj-pdf-v1", JSON.stringify(created)],
);

const counts = (
  await db.query(
    `select
      (select count(*)::int from topicos t join materias m on m.id = t.materia_id where m.profile_id = $1) as topicos,
      (select count(*)::int from assuntos a join topicos t on t.id = a.topico_id join materias m on m.id = t.materia_id where m.profile_id = $1) as assuntos,
      (select count(*)::int from historico h join assuntos a on a.id = h.assunto_id join topicos t on t.id = a.topico_id join materias m on m.id = t.materia_id where m.profile_id = $1) as historico`,
    [profile.id],
  )
).rows[0];

console.log("profile", profile);
console.log("created", created);
console.log("db counts", counts);
console.log("payload stats", payload.stats);
if (counts.topicos !== payload.stats.topicos) throw new Error("topicos mismatch");
if (counts.assuntos !== payload.stats.assuntos) throw new Error("assuntos mismatch");
if (counts.historico !== payload.stats.historico) throw new Error("historico mismatch");
console.log("SMOKE OK");
