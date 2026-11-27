/** ACUMULADO U20 = média simples dos últimos 20 percentuais. */
export function acumuladoU20(percentuais: number[]): number | null {
  if (percentuais.length === 0) return null;
  const slice = percentuais.slice(-20);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

/** Média aritmética simples; null se lista vazia. */
export function mediaSimples(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function percentualEntrada(acertos: number, quantidade: number): number {
  return (acertos / quantidade) * 100;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function scoreTone(value: number | null | undefined): "ok" | "low" | "empty" {
  if (value === null || value === undefined || Number.isNaN(value)) return "empty";
  return value >= 70 ? "ok" : "low";
}
