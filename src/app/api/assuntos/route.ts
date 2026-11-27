import { json, requireViewer } from "@/lib/auth";
import { AuthzError, addAssunto } from "@/lib/data";

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json()) as { topicoId?: string; nome?: string };
    if (!body.topicoId || !body.nome?.trim()) {
      return json({ error: "topicoId e nome obrigatórios" }, { status: 400 });
    }
    const assunto = await addAssunto(
      { sub: viewer.sub, stage: viewer.stage },
      body.topicoId,
      body.nome,
    );
    return json({ assunto }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) {
      return json({ error: e.message }, { status: e.status === 404 ? 404 : 400 });
    }
    throw e;
  }
}
