async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return data;
}

export const api = {
  profiles: () =>
    req<{
      profiles: import("./types").Profile[];
      activeProfileId: string | null;
      viewer: { name: string; simulated: boolean };
    }>("/api/profiles"),
  createProfile: (body: {
    nome: string;
    identificacao?: string;
    concurso?: string;
    cargo?: string;
    seedMaterias?: boolean;
  }) => req<{ profile: import("./types").Profile }>("/api/profiles", { method: "POST", body: JSON.stringify(body) }),
  updateProfile: (
    id: string,
    body: { nome: string; identificacao?: string; concurso?: string; cargo?: string },
  ) =>
    req<{ profile: import("./types").Profile }>(`/api/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProfile: (id: string) =>
    req<{ ok: boolean }>(`/api/profiles/${id}`, { method: "DELETE" }),
  activateProfile: (id: string) =>
    req<{ activeProfileId: string }>(`/api/profiles/${id}/activate`, { method: "POST" }),
  tree: (profileId: string) =>
    req<import("./types").TreePayload>(`/api/tree/${profileId}`),
  addMateria: (profileId: string, nome: string) =>
    req("/api/materias", { method: "POST", body: JSON.stringify({ profileId, nome }) }),
  renameMateria: (id: string, nome: string) =>
    req(`/api/materias/${id}`, { method: "PATCH", body: JSON.stringify({ nome }) }),
  deleteMateria: (id: string) =>
    req(`/api/materias/${id}`, { method: "DELETE" }),
  addTopico: (materiaId: string, nome: string) =>
    req("/api/topicos", { method: "POST", body: JSON.stringify({ materiaId, nome }) }),
  renameTopico: (id: string, nome: string) =>
    req(`/api/topicos/${id}`, { method: "PATCH", body: JSON.stringify({ nome }) }),
  deleteTopico: (id: string) =>
    req(`/api/topicos/${id}`, { method: "DELETE" }),
  addAssunto: (topicoId: string, nome: string) =>
    req("/api/assuntos", { method: "POST", body: JSON.stringify({ topicoId, nome }) }),
  renameAssunto: (id: string, nome: string) =>
    req(`/api/assuntos/${id}`, { method: "PATCH", body: JSON.stringify({ nome }) }),
  deleteAssunto: (id: string) =>
    req(`/api/assuntos/${id}`, { method: "DELETE" }),
  addHistorico: (assuntoId: string, acertos: number, quantidade: number) =>
    req<{ entry: import("./types").HistoricoEntry }>("/api/historico", {
      method: "POST",
      body: JSON.stringify({ assuntoId, acertos, quantidade }),
    }),
  deleteHistorico: (id: string) =>
    req<{
      ok: boolean;
      entry: {
        id: string;
        assuntoId: string;
        acertos: number;
        quantidade: number;
        percentual: number;
      };
    }>(`/api/historico/${id}`, { method: "DELETE" }),
  importCremerjStatus: () =>
    req<{
      profile: { id: string; nome: string; concurso: string } | null;
      imported: boolean;
      importedAt: string | null;
    }>("/api/import/cremerj"),
  importCremerj: (body?: { profileId?: string; force?: boolean }) =>
    req<{
      ok: boolean;
      profileId: string;
      alreadyImported: boolean;
      created: {
        materias: number;
        topicos: number;
        assuntos: number;
        historico: number;
      };
      reused: {
        materias: number;
        topicos: number;
        assuntos: number;
        historicoSkipped: number;
      };
      gaps: string[];
      sourceStats: Record<string, number>;
    }>("/api/import/cremerj", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
};
