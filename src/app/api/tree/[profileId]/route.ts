import { json, requireViewer } from "@/lib/auth";
import { loadTree } from "@/lib/data";

type Ctx = { params: Promise<{ profileId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { profileId } = await ctx.params;
  const tree = await loadTree(
    { sub: viewer.sub, stage: viewer.stage },
    profileId,
  );
  if (!tree) return json({ error: "Perfil não encontrado" }, { status: 404 });
  return json(tree);
}
