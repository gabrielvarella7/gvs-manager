import { json, requireViewer } from "@/lib/auth";
import {
  AuthzError,
  deleteProfile,
  getActiveProfileId,
  setActiveProfileId,
  updateProfile,
} from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as {
      nome?: string;
      identificacao?: string;
      concurso?: string;
      cargo?: string;
      activate?: boolean;
    };
    const owner = { sub: viewer.sub, stage: viewer.stage };
    if (body.activate) {
      const updated = body.nome
        ? await updateProfile(owner, id, {
            nome: body.nome,
            identificacao: body.identificacao,
            concurso: body.concurso,
            cargo: body.cargo,
          })
        : null;
      await setActiveProfileId(owner, id);
      return json({ ok: true, profile: updated, activeProfileId: id });
    }
    if (!body.nome?.trim()) {
      return json({ error: "Nome obrigatório" }, { status: 400 });
    }
    const profile = await updateProfile(owner, id, {
      nome: body.nome,
      identificacao: body.identificacao,
      concurso: body.concurso,
      cargo: body.cargo,
    });
    if (!profile) return json({ error: "Perfil não encontrado" }, { status: 404 });
    return json({ profile });
  } catch (e) {
    if (e instanceof AuthzError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const owner = { sub: viewer.sub, stage: viewer.stage };
  const ok = await deleteProfile(owner, id);
  if (!ok) return json({ error: "Perfil não encontrado" }, { status: 404 });
  const active = await getActiveProfileId(owner);
  if (active === id) await setActiveProfileId(owner, null);
  return json({ ok: true });
}
