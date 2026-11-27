export type Profile = {
  id: string;
  nome: string;
  identificacao: string;
  concurso: string;
  cargo: string;
  created_at: string;
  updated_at: string;
};

export type HistoricoEntry = {
  id: string;
  acertos: number;
  quantidade: number;
  percentual: number;
  created_at: string;
};

export type AssuntoNode = {
  id: string;
  nome: string;
  sort_order: number;
  u20: number | null;
  recentes: HistoricoEntry[];
};

export type TopicoNode = {
  id: string;
  nome: string;
  sort_order: number;
  media: number | null;
  assuntos: AssuntoNode[];
};

export type MateriaNode = {
  id: string;
  nome: string;
  sort_order: number;
  media: number | null;
  topicos: TopicoNode[];
};

export type TreePayload = {
  profile: Profile;
  materias: MateriaNode[];
};

export const SEED_MATERIAS = [
  "Português",
  "RLM",
  "Informática",
  "CREMERJ",
  "Constitucional",
  "D Administrativo",
  "F Administração",
] as const;
