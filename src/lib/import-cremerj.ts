import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "./db";
import { AuthzError, getOwnedProfile, listProfiles } from "./data";

type Owner = { sub: string; stage: string };

type ImportHistorico = {
  acertos: number;
  quantidade: number;
  percentual: number;
};

type ImportAssunto = {
  nome: string;
  sort_order: number;
  u20_pdf?: number | null;
  historico: ImportHistorico[];
};

type ImportTopico = {
  nome: string;
  sort_order: number;
  media_pdf?: number | null;
  assuntos: ImportAssunto[];
};

type ImportMateria = {
  nome: string;
  topicos: ImportTopico[];
};

type ImportPayload = {
  version: number;
  source: string;
  gaps: string[];
  stats: Record<string, number>;
  materias: ImportMateria[];
};

export const CREMERJ_IMPORT_KEY = "cremerj-pdf-v1";

let cachedPayload: ImportPayload | null = null;

async function loadPayload(): Promise<ImportPayload> {
  if (cachedPayload) return cachedPayload;
  const file = path.join(process.cwd(), "src/data/cremerj-import.json");
  const raw = await readFile(file, "utf8");
  cachedPayload = JSON.parse(raw) as ImportPayload;
  return cachedPayload;
}

function isCremerjProfile(p: { nome: string; concurso: string; identificacao: string }) {
  const blob = `${p.nome} ${p.concurso} ${p.identificacao}`.toLowerCase();
  return blob.includes("cremerj");
}

export async function findCremerjProfile(owner: Owner) {
  const profiles = await listProfiles(owner);
  return profiles.find(isCremerjProfile) ?? null;
}

export type CremerjImportResult = {
  profileId: string;
  alreadyImported: boolean;
  created: {
    materias: number;
    topicos: number;
    assuntos: number;
    historico: number;
  };
  reused: {
    materias: number;
    topicos: number;
    assuntos: number;
    historicoSkipped: number;
  };
  gaps: string[];
  sourceStats: Record<string, number>;
};

export async function importCremerjPdf(
  owner: Owner,
  options: { profileId?: string; force?: boolean } = {},
): Promise<CremerjImportResult> {
  const payload = await loadPayload();

  let profileId = options.profileId;
  if (profileId) {
    const owned = await getOwnedProfile(owner, profileId);
    if (!owned) throw new AuthzError("Perfil não encontrado", 404);
    if (!isCremerjProfile(owned)) {
      throw new AuthzError("Importação restrita ao perfil CREMERJ", 400);
    }
  } else {
    const found = await findCremerjProfile(owner);
    if (!found) {
      throw new AuthzError(
        "Perfil CREMERJ não encontrado (nome/concurso/identificação)",
        404,
      );
    }
    profileId = found.id;
  }

  const existingRuns = await sql<{ id: string }>(
    `select id from import_runs where profile_id = $1 and import_key = $2`,
    [profileId, CREMERJ_IMPORT_KEY],
  );
  if (existingRuns.length > 0 && !options.force) {
    return {
      profileId,
      alreadyImported: true,
      created: { materias: 0, topicos: 0, assuntos: 0, historico: 0 },
      reused: { materias: 0, topicos: 0, assuntos: 0, historicoSkipped: 0 },
      gaps: payload.gaps,
      sourceStats: payload.stats,
    };
  }

  const created = { materias: 0, topicos: 0, assuntos: 0, historico: 0 };
  const reused = { materias: 0, topicos: 0, assuntos: 0, historicoSkipped: 0 };

  for (const [mi, materia] of payload.materias.entries()) {
    // Aceita nome atual ou legado (ex.: "D Administrativo" ↔ "Direito Administrativo").
    const nameAliases =
      materia.nome === "Direito Administrativo"
        ? ["Direito Administrativo", "D Administrativo"]
        : materia.nome === "D Administrativo"
          ? ["Direito Administrativo", "D Administrativo"]
          : [materia.nome];
    const canonicalNome =
      materia.nome === "D Administrativo" ? "Direito Administrativo" : materia.nome;

    let existingM: { id: string; nome: string } | undefined;
    for (const alias of nameAliases) {
      const rows = await sql<{ id: string; nome: string }>(
        `select id, nome from materias
         where profile_id = $1 and lower(nome) = lower($2)
         order by sort_order limit 1`,
        [profileId, alias],
      );
      if (rows[0]) {
        existingM = rows[0];
        break;
      }
    }
    let materiaId: string;
    if (existingM) {
      materiaId = existingM.id;
      if (existingM.nome !== canonicalNome) {
        await sql(`update materias set nome = $2 where id = $1`, [
          materiaId,
          canonicalNome,
        ]);
      }
      reused.materias += 1;
    } else {
      const max = await sql<{ m: number }>(
        `select coalesce(max(sort_order), -1) as m from materias where profile_id = $1`,
        [profileId],
      );
      const inserted = await sql<{ id: string }>(
        `insert into materias (profile_id, nome, sort_order) values ($1, $2, $3) returning id`,
        [profileId, canonicalNome, Math.max(mi, (max[0]?.m ?? -1) + 1)],
      );
      materiaId = inserted[0].id;
      created.materias += 1;
    }

    for (const [ti, topico] of materia.topicos.entries()) {
      const existingT = await sql<{ id: string }>(
        `select id from topicos
         where materia_id = $1 and lower(nome) = lower($2)
         order by sort_order limit 1`,
        [materiaId, topico.nome],
      );
      let topicoId: string;
      if (existingT[0]) {
        topicoId = existingT[0].id;
        reused.topicos += 1;
      } else {
        const max = await sql<{ m: number }>(
          `select coalesce(max(sort_order), -1) as m from topicos where materia_id = $1`,
          [materiaId],
        );
        const inserted = await sql<{ id: string }>(
          `insert into topicos (materia_id, nome, sort_order) values ($1, $2, $3) returning id`,
          [materiaId, topico.nome, topico.sort_order ?? Math.max(ti, (max[0]?.m ?? -1) + 1)],
        );
        topicoId = inserted[0].id;
        created.topicos += 1;
      }

      for (const [ai, assunto] of topico.assuntos.entries()) {
        const existingA = await sql<{ id: string }>(
          `select id from assuntos
           where topico_id = $1 and lower(nome) = lower($2)
           order by sort_order limit 1`,
          [topicoId, assunto.nome],
        );
        let assuntoId: string;
        if (existingA[0]) {
          assuntoId = existingA[0].id;
          reused.assuntos += 1;
        } else {
          const max = await sql<{ m: number }>(
            `select coalesce(max(sort_order), -1) as m from assuntos where topico_id = $1`,
            [topicoId],
          );
          const inserted = await sql<{ id: string }>(
            `insert into assuntos (topico_id, nome, sort_order) values ($1, $2, $3) returning id`,
            [
              topicoId,
              assunto.nome,
              assunto.sort_order ?? Math.max(ai, (max[0]?.m ?? -1) + 1),
            ],
          );
          assuntoId = inserted[0].id;
          created.assuntos += 1;
        }

        const histCount = await sql<{ c: number }>(
          `select count(*)::int as c from historico where assunto_id = $1`,
          [assuntoId],
        );
        if ((histCount[0]?.c ?? 0) > 0) {
          if (assunto.historico.length > 0) reused.historicoSkipped += assunto.historico.length;
          continue;
        }
        for (const h of assunto.historico) {
          if (!Number.isInteger(h.acertos) || !Number.isInteger(h.quantidade)) continue;
          if (h.quantidade <= 0 || h.acertos < 0 || h.acertos > h.quantidade) continue;
          const percentual = (h.acertos / h.quantidade) * 100;
          await sql(
            `insert into historico (assunto_id, acertos, quantidade, percentual)
             values ($1, $2, $3, $4)`,
            [assuntoId, h.acertos, h.quantidade, percentual],
          );
          created.historico += 1;
        }
      }
    }
  }

  await sql(`update profiles set updated_at = now() where id = $1`, [profileId]);

  await sql(
    `insert into import_runs (profile_id, import_key, stats)
     values ($1, $2, $3::jsonb)
     on conflict (profile_id, import_key) do update set
       stats = excluded.stats,
       created_at = now()`,
    [
      profileId,
      CREMERJ_IMPORT_KEY,
      JSON.stringify({ created, reused, sourceStats: payload.stats }),
    ],
  );

  return {
    profileId,
    alreadyImported: false,
    created,
    reused,
    gaps: payload.gaps,
    sourceStats: payload.stats,
  };
}
