import { json, requireViewer } from "@/lib/auth";
import { getOwnedProfile, setActiveProfileId } from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const owner = { sub: viewer.sub, stage: viewer.stage };
  const profile = await getOwnedProfile(owner, id);
  if (!profile) return json({ error: "Perfil não encontrado" }, { status: 404 });
  await setActiveProfileId(owner, id);
  return json({ activeProfileId: id, profile });
}
