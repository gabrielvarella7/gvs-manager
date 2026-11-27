import { json, requireViewer } from "@/lib/auth";
import {
  AuthzError,
  createProfile,
  getActiveProfileId,
  listProfiles,
  setActiveProfileId,
} from "@/lib/data";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const owner = { sub: viewer.sub, stage: viewer.stage };
  const profiles = await listProfiles(owner);
  let activeProfileId = await getActiveProfileId(owner);
  if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id ?? null;
    await setActiveProfileId(owner, activeProfileId);
  }
  if (!activeProfileId && profiles[0]) {
    activeProfileId = profiles[0].id;
    await setActiveProfileId(owner, activeProfileId);
  }
  return json({ profiles, activeProfileId, viewer: { name: viewer.name, simulated: viewer.simulated } });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  try {
    const body = (await request.json()) as {
      nome?: string;
      identificacao?: string;
      concurso?: string;
      cargo?: string;
      seedMaterias?: boolean;
    };
    if (!body.nome?.trim()) {
      return json({ error: "Nome obrigatório" }, { status: 400 });
    }
    const profile = await createProfile(
      { sub: viewer.sub, stage: viewer.stage },
      {
        nome: body.nome,
        identificacao: body.identificacao,
        concurso: body.concurso,
        cargo: body.cargo,
        seedMaterias: body.seedMaterias,
      },
    );
    return json({ profile }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
}
