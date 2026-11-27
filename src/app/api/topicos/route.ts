import { json, requireViewer } from "@/lib/auth";
import { AuthzError, addTopico } from "@/lib/data";

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json()) as { materiaId?: string; nome?: string };
    if (!body.materiaId || !body.nome?.trim()) {
      return json({ error: "materiaId e nome obrigatórios" }, { status: 400 });
    }
    const topico = await addTopico(
      { sub: viewer.sub, stage: viewer.stage },
      body.materiaId,
      body.nome,
    );
    return json({ topico }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) {
      return json({ error: e.message }, { status: e.status === 404 ? 404 : 400 });
    }
    throw e;
  }
}
