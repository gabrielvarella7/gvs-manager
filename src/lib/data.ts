import { sql } from "./db";
import { acumuladoU20, mediaSimples } from "./calc";
import {
  MATERIA_RENAMES,
  SEED_MATERIAS,
  type AssuntoNode,
  type HistoricoEntry,
  type MateriaNode,
  type Profile,
  type TopicoNode,
  type TreePayload,
} from "./types";

type Owner = { sub: string; stage: string };

/** Renomeia matérias legadas no perfil (ex.: D Administrativo → Direito Administrativo). */
export async function applyMateriaRenames(profileId: string): Promise<void> {
  for (const [from, to] of Object.entries(MATERIA_RENAMES)) {
    await sql(
      `update materias set nome = $3
       where profile_id = $1 and lower(nome) = lower($2)
         and not exists (
           select 1 from materias m2
           where m2.profile_id = $1 and lower(m2.nome) = lower($3)
         )`,
      [profileId, from, to],
    );
  }
}

export async function listProfiles(owner: Owner): Promise<Profile[]> {
  return sql<Profile>(
    `select id, nome, identificacao, concurso, cargo, created_at::text, updated_at::text
     from profiles where owner_sub = $1 and stage = $2
     order by updated_at desc`,
    [owner.sub, owner.stage],
  );
}

export async function getActiveProfileId(owner: Owner): Promise<string | null> {
  const rows = await sql<{ active_profile_id: string | null }>(
    `select active_profile_id from user_settings where owner_sub = $1 and stage = $2`,
    [owner.sub, owner.stage],
  );
  return rows[0]?.active_profile_id ?? null;
}

export async function setActiveProfileId(
  owner: Owner,
  profileId: string | null,
): Promise<void> {
  await sql(
    `insert into user_settings (owner_sub, stage, active_profile_id)
     values ($1, $2, $3)
     on conflict (owner_sub, stage) do update set active_profile_id = excluded.active_profile_id`,
    [owner.sub, owner.stage, profileId],
  );
}

export async function getOwnedProfile(
  owner: Owner,
  profileId: string,
): Promise<Profile | null> {
  const rows = await sql<Profile>(
    `select id, nome, identificacao, concurso, cargo, created_at::text, updated_at::text
     from profiles where id = $1 and owner_sub = $2 and stage = $3`,
    [profileId, owner.sub, owner.stage],
  );
  return rows[0] ?? null;
}

export async function createProfile(
  owner: Owner,
  input: {
    nome: string;
    identificacao?: string;
    concurso?: string;
    cargo?: string;
    seedMaterias?: boolean;
  },
): Promise<Profile> {
  const rows = await sql<Profile>(
    `insert into profiles (owner_sub, stage, nome, identificacao, concurso, cargo)
     values ($1, $2, $3, $4, $5, $6)
     returning id, nome, identificacao, concurso, cargo, created_at::text, updated_at::text`,
    [
      owner.sub,
      owner.stage,
      input.nome.trim(),
      (input.identificacao ?? "").trim(),
      (input.concurso ?? "").trim(),
      (input.cargo ?? "").trim(),
    ],
  );
  const profile = rows[0];
  if (input.seedMaterias !== false) {
    let order = 0;
    for (const nome of SEED_MATERIAS) {
      await sql(
        `insert into materias (profile_id, nome, sort_order) values ($1, $2, $3)`,
        [profile.id, nome, order++],
      );
    }
  }
  await setActiveProfileId(owner, profile.id);
  return profile;
}

export async function updateProfile(
  owner: Owner,
  profileId: string,
  input: {
    nome: string;
    identificacao?: string;
    concurso?: string;
    cargo?: string;
  },
): Promise<Profile | null> {
  const rows = await sql<Profile>(
    `update profiles set
       nome = $4,
       identificacao = $5,
       concurso = $6,
       cargo = $7,
       updated_at = now()
     where id = $1 and owner_sub = $2 and stage = $3
     returning id, nome, identificacao, concurso, cargo, created_at::text, updated_at::text`,
    [
      profileId,
      owner.sub,
      owner.stage,
      input.nome.trim(),
      (input.identificacao ?? "").trim(),
      (input.concurso ?? "").trim(),
      (input.cargo ?? "").trim(),
    ],
  );
  return rows[0] ?? null;
}

export async function deleteProfile(owner: Owner, profileId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `delete from profiles where id = $1 and owner_sub = $2 and stage = $3 returning id`,
    [profileId, owner.sub, owner.stage],
  );
  return rows.length > 0;
}

async function assertProfileOwned(owner: Owner, profileId: string) {
  const p = await getOwnedProfile(owner, profileId);
  if (!p) throw new AuthzError("Perfil não encontrado", 404);
  return p;
}

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function addMateria(
  owner: Owner,
  profileId: string,
  nome: string,
): Promise<{ id: string; nome: string }> {
  await assertProfileOwned(owner, profileId);
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const max = await sql<{ m: number }>(
    `select coalesce(max(sort_order), -1) as m from materias where profile_id = $1`,
    [profileId],
  );
  const rows = await sql<{ id: string; nome: string }>(
    `insert into materias (profile_id, nome, sort_order) values ($1, $2, $3)
     returning id, nome`,
    [profileId, trimmed, (max[0]?.m ?? -1) + 1],
  );
  await touchProfile(profileId);
  return rows[0];
}

export async function renameMateria(
  owner: Owner,
  materiaId: string,
  nome: string,
): Promise<boolean> {
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const ok = await ownedMateria(owner, materiaId);
  if (!ok) return false;
  await sql(`update materias set nome = $2 where id = $1`, [materiaId, trimmed]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function deleteMateria(owner: Owner, materiaId: string): Promise<boolean> {
  const ok = await ownedMateria(owner, materiaId);
  if (!ok) return false;
  await sql(`delete from materias where id = $1`, [materiaId]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function addTopico(
  owner: Owner,
  materiaId: string,
  nome: string,
): Promise<{ id: string; nome: string }> {
  const ok = await ownedMateria(owner, materiaId);
  if (!ok) throw new AuthzError("Matéria não encontrada", 404);
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const max = await sql<{ m: number }>(
    `select coalesce(max(sort_order), -1) as m from topicos where materia_id = $1`,
    [materiaId],
  );
  const rows = await sql<{ id: string; nome: string }>(
    `insert into topicos (materia_id, nome, sort_order) values ($1, $2, $3)
     returning id, nome`,
    [materiaId, trimmed, (max[0]?.m ?? -1) + 1],
  );
  await touchProfile(ok.profile_id);
  return rows[0];
}

export async function renameTopico(
  owner: Owner,
  topicoId: string,
  nome: string,
): Promise<boolean> {
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const ok = await ownedTopico(owner, topicoId);
  if (!ok) return false;
  await sql(`update topicos set nome = $2 where id = $1`, [topicoId, trimmed]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function deleteTopico(owner: Owner, topicoId: string): Promise<boolean> {
  const ok = await ownedTopico(owner, topicoId);
  if (!ok) return false;
  await sql(`delete from topicos where id = $1`, [topicoId]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function addAssunto(
  owner: Owner,
  topicoId: string,
  nome: string,
): Promise<{ id: string; nome: string }> {
  const ok = await ownedTopico(owner, topicoId);
  if (!ok) throw new AuthzError("Tópico não encontrado", 404);
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const max = await sql<{ m: number }>(
    `select coalesce(max(sort_order), -1) as m from assuntos where topico_id = $1`,
    [topicoId],
  );
  const rows = await sql<{ id: string; nome: string }>(
    `insert into assuntos (topico_id, nome, sort_order) values ($1, $2, $3)
     returning id, nome`,
    [topicoId, trimmed, (max[0]?.m ?? -1) + 1],
  );
  await touchProfile(ok.profile_id);
  return rows[0];
}

export async function renameAssunto(
  owner: Owner,
  assuntoId: string,
  nome: string,
): Promise<boolean> {
  const trimmed = nome.trim();
  if (!trimmed) throw new AuthzError("Nome obrigatório");
  const ok = await ownedAssunto(owner, assuntoId);
  if (!ok) return false;
  await sql(`update assuntos set nome = $2 where id = $1`, [assuntoId, trimmed]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function deleteAssunto(owner: Owner, assuntoId: string): Promise<boolean> {
  const ok = await ownedAssunto(owner, assuntoId);
  if (!ok) return false;
  await sql(`delete from assuntos where id = $1`, [assuntoId]);
  await touchProfile(ok.profile_id);
  return true;
}

export async function appendHistorico(
  owner: Owner,
  assuntoId: string,
  acertos: number,
  quantidade: number,
): Promise<HistoricoEntry> {
  const ok = await ownedAssunto(owner, assuntoId);
  if (!ok) throw new AuthzError("Assunto não encontrado", 404);
  if (!Number.isInteger(acertos) || !Number.isInteger(quantidade)) {
    throw new AuthzError("Acertos e quantidade devem ser inteiros");
  }
  if (quantidade <= 0 || acertos < 0 || acertos > quantidade) {
    throw new AuthzError("Valores inválidos (acertos ≤ quantidade; quantidade > 0)");
  }
  const percentual = (acertos / quantidade) * 100;
  const rows = await sql<HistoricoEntry>(
    `insert into historico (assunto_id, acertos, quantidade, percentual)
     values ($1, $2, $3, $4)
     returning id, acertos, quantidade, percentual, created_at::text`,
    [assuntoId, acertos, quantidade, percentual],
  );
  await touchProfile(ok.profile_id);
  return rows[0];
}

export async function deleteHistorico(
  owner: Owner,
  historicoId: string,
): Promise<{
  id: string;
  assuntoId: string;
  acertos: number;
  quantidade: number;
  percentual: number;
} | null> {
  const rows = await sql<{
    id: string;
    assunto_id: string;
    acertos: number;
    quantidade: number;
    percentual: number;
    profile_id: string;
  }>(
    `select h.id, h.assunto_id, h.acertos, h.quantidade, h.percentual, m.profile_id
     from historico h
     join assuntos a on a.id = h.assunto_id
     join topicos t on t.id = a.topico_id
     join materias m on m.id = t.materia_id
     join profiles p on p.id = m.profile_id
     where h.id = $1 and p.owner_sub = $2 and p.stage = $3`,
    [historicoId, owner.sub, owner.stage],
  );
  const row = rows[0];
  if (!row) return null;
  await sql(`delete from historico where id = $1`, [historicoId]);
  await touchProfile(row.profile_id);
  return {
    id: row.id,
    assuntoId: row.assunto_id,
    acertos: row.acertos,
    quantidade: row.quantidade,
    percentual: row.percentual,
  };
}

async function touchProfile(profileId: string) {
  await sql(`update profiles set updated_at = now() where id = $1`, [profileId]);
}

async function ownedMateria(owner: Owner, materiaId: string) {
  const rows = await sql<{ id: string; profile_id: string }>(
    `select m.id, m.profile_id from materias m
     join profiles p on p.id = m.profile_id
     where m.id = $1 and p.owner_sub = $2 and p.stage = $3`,
    [materiaId, owner.sub, owner.stage],
  );
  return rows[0] ?? null;
}

async function ownedTopico(owner: Owner, topicoId: string) {
  const rows = await sql<{ id: string; profile_id: string }>(
    `select t.id, m.profile_id from topicos t
     join materias m on m.id = t.materia_id
     join profiles p on p.id = m.profile_id
     where t.id = $1 and p.owner_sub = $2 and p.stage = $3`,
    [topicoId, owner.sub, owner.stage],
  );
  return rows[0] ?? null;
}

async function ownedAssunto(owner: Owner, assuntoId: string) {
  const rows = await sql<{ id: string; profile_id: string }>(
    `select a.id, m.profile_id from assuntos a
     join topicos t on t.id = a.topico_id
     join materias m on m.id = t.materia_id
     join profiles p on p.id = m.profile_id
     where a.id = $1 and p.owner_sub = $2 and p.stage = $3`,
    [assuntoId, owner.sub, owner.stage],
  );
  return rows[0] ?? null;
}

export async function loadTree(
  owner: Owner,
  profileId: string,
): Promise<TreePayload | null> {
  const profile = await getOwnedProfile(owner, profileId);
  if (!profile) return null;

  await applyMateriaRenames(profileId);

  const materias = await sql<{ id: string; nome: string; sort_order: number }>(
    `select id, nome, sort_order from materias where profile_id = $1 order by sort_order, created_at`,
    [profileId],
  );
  const topicos = await sql<{
    id: string;
    materia_id: string;
    nome: string;
    sort_order: number;
  }>(
    `select t.id, t.materia_id, t.nome, t.sort_order
     from topicos t
     join materias m on m.id = t.materia_id
     where m.profile_id = $1
     order by t.sort_order, t.created_at`,
    [profileId],
  );
  const assuntos = await sql<{
    id: string;
    topico_id: string;
    nome: string;
    sort_order: number;
  }>(
    `select a.id, a.topico_id, a.nome, a.sort_order
     from assuntos a
     join topicos t on t.id = a.topico_id
     join materias m on m.id = t.materia_id
     where m.profile_id = $1
     order by a.sort_order, a.created_at`,
    [profileId],
  );
  const historico = await sql<HistoricoEntry & { assunto_id: string }>(
    `select h.id, h.assunto_id, h.acertos, h.quantidade, h.percentual, h.created_at::text
     from historico h
     join assuntos a on a.id = h.assunto_id
     join topicos t on t.id = a.topico_id
     join materias m on m.id = t.materia_id
     where m.profile_id = $1
     order by h.created_at asc`,
    [profileId],
  );

  const histByAssunto = new Map<string, HistoricoEntry[]>();
  for (const h of historico) {
    const list = histByAssunto.get(h.assunto_id) ?? [];
    list.push({
      id: h.id,
      acertos: h.acertos,
      quantidade: h.quantidade,
      percentual: h.percentual,
      created_at: h.created_at,
    });
    histByAssunto.set(h.assunto_id, list);
  }

  const assuntosByTopico = new Map<string, AssuntoNode[]>();
  for (const a of assuntos) {
    const entries = histByAssunto.get(a.id) ?? [];
    const u20 = acumuladoU20(entries.map((e) => e.percentual));
    const recentes = entries.slice(-8).reverse();
    const node: AssuntoNode = {
      id: a.id,
      nome: a.nome,
      sort_order: a.sort_order,
      u20,
      recentes,
    };
    const list = assuntosByTopico.get(a.topico_id) ?? [];
    list.push(node);
    assuntosByTopico.set(a.topico_id, list);
  }

  const topicosByMateria = new Map<string, TopicoNode[]>();
  for (const t of topicos) {
    const as = assuntosByTopico.get(t.id) ?? [];
    const media = mediaSimples(
      as.map((x) => x.u20).filter((v): v is number => v !== null),
    );
    const node: TopicoNode = {
      id: t.id,
      nome: t.nome,
      sort_order: t.sort_order,
      media,
      assuntos: as,
    };
    const list = topicosByMateria.get(t.materia_id) ?? [];
    list.push(node);
    topicosByMateria.set(t.materia_id, list);
  }

  const materiaNodes: MateriaNode[] = materias.map((m) => {
    const ts = topicosByMateria.get(m.id) ?? [];
    const media = mediaSimples(
      ts.map((x) => x.media).filter((v): v is number => v !== null),
    );
    return {
      id: m.id,
      nome: m.nome,
      sort_order: m.sort_order,
      media,
      topicos: ts,
    };
  });

  return { profile, materias: materiaNodes };
}
