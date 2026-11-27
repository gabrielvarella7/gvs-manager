import { formatPct, scoreTone } from "@/lib/calc";

export function Score({
  value,
  size = "md",
}: {
  value: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const tone = scoreTone(value);
  const cls =
    tone === "ok" ? "score-ok" : tone === "low" ? "score-low" : "score-empty";
  const sizeCls =
    size === "lg" ? "text-xl font-semibold" : size === "sm" ? "text-xs" : "text-sm font-medium";
  return <span className={`tabular-nums ${sizeCls} ${cls}`}>{formatPct(value)}</span>;
}
