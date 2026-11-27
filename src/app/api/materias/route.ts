import { json, requireViewer } from "@/lib/auth";
import { AuthzError, addMateria } from "@/lib/data";

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json()) as { profileId?: string; nome?: string };
    if (!body.profileId || !body.nome?.trim()) {
      return json({ error: "profileId e nome obrigatórios" }, { status: 400 });
    }
    const materia = await addMateria(
      { sub: viewer.sub, stage: viewer.stage },
      body.profileId,
      body.nome,
    );
    return json({ materia }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) {
      return json({ error: e.message }, { status: e.status === 404 ? 404 : 400 });
    }
    throw e;
  }
}
