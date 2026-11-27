import { json, requireViewer } from "@/lib/auth";
import { AuthzError } from "@/lib/data";
import { importCremerjPdf } from "@/lib/import-cremerj";

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      profileId?: string;
      force?: boolean;
    };
    const result = await importCremerjPdf(
      { sub: viewer.sub, stage: viewer.stage },
      { profileId: body.profileId, force: body.force === true },
    );
    return json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AuthzError) {
      return json({ error: e.message }, { status: e.status === 404 ? 404 : 400 });
    }
    throw e;
  }
}

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { findCremerjProfile, CREMERJ_IMPORT_KEY } = await import("@/lib/import-cremerj");
  const { sql } = await import("@/lib/db");
  const profile = await findCremerjProfile({ sub: viewer.sub, stage: viewer.stage });
  if (!profile) {
    return json({ profile: null, imported: false });
  }
  const runs = await sql<{ created_at: string }>(
    `select created_at::text from import_runs where profile_id = $1 and import_key = $2`,
    [profile.id, CREMERJ_IMPORT_KEY],
  );
  return json({
    profile: { id: profile.id, nome: profile.nome, concurso: profile.concurso },
    imported: runs.length > 0,
    importedAt: runs[0]?.created_at ?? null,
  });
}
