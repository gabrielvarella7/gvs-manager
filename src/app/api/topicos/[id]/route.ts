import { json, requireViewer } from "@/lib/auth";
import { AuthzError, deleteTopico, renameTopico } from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { nome?: string };
    if (!body.nome?.trim()) return json({ error: "Nome obrigatório" }, { status: 400 });
    const ok = await renameTopico(
      { sub: viewer.sub, stage: viewer.stage },
      id,
      body.nome,
    );
    if (!ok) return json({ error: "Tópico não encontrado" }, { status: 404 });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AuthzError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const ok = await deleteTopico({ sub: viewer.sub, stage: viewer.stage }, id);
  if (!ok) return json({ error: "Tópico não encontrado" }, { status: 404 });
  return json({ ok: true });
}
