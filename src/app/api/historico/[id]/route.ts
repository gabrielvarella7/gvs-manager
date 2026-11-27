import { json, requireViewer } from "@/lib/auth";
import { deleteHistorico } from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const deleted = await deleteHistorico(
    { sub: viewer.sub, stage: viewer.stage },
    id,
  );
  if (!deleted) return json({ error: "Entrada não encontrada" }, { status: 404 });
  return json({ ok: true, entry: deleted });
}
