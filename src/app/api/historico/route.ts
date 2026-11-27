import { json, requireViewer } from "@/lib/auth";
import { AuthzError, appendHistorico } from "@/lib/data";

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json()) as {
      assuntoId?: string;
      acertos?: number;
      quantidade?: number;
    };
    if (!body.assuntoId) {
      return json({ error: "assuntoId obrigatório" }, { status: 400 });
    }
    const entry = await appendHistorico(
      { sub: viewer.sub, stage: viewer.stage },
      body.assuntoId,
      Number(body.acertos),
      Number(body.quantidade),
    );
    return json({ entry }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) {
      return json({ error: e.message }, { status: e.status === 404 ? 404 : 400 });
    }
    throw e;
  }
}
