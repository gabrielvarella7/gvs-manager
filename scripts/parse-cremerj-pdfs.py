#!/usr/bin/env python3
"""Re-parse CREMERJ study PDFs into src/data/cremerj-import.json.

Expects text extracts or PDFs. Default: read extracted .txt under --extract-dir,
or PDFs under --pdf-dir (requires pypdf).
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

JUNK_TITLE_RE = re.compile(
    r"gest[aã]o de processos e projetos|mapa da banca|mec[aã]nica|palavras[-\s]*chaves?",
    re.I,
)
PCT_RE = re.compile(r"-?\d{1,3}(?:[.,]\d+)?\s*%|-?%")
AULA_START = re.compile(r"^(\d{2})\s+(.*)$")

FILE_MAP = [
    ("01_Portugue_s_171d", "Português"),
    ("03_INFO_6a7e", "Informática"),
    ("04_Legs_CREMERJ_61d7", "CREMERJ"),
    ("05_Constitucional_a545", "Constitucional"),
    ("06_D_Administrativo_6b48", "D Administrativo"),
    ("07_F_Administrac_a_o_5499", "F Administração"),
]

STRATEGIES = {
    "Português": "portugues",
    "Informática": "info",
    "CREMERJ": "cremerj",
    "Constitucional": "constitucional",
    "D Administrativo": "dadm",
    "F Administração": "f_adm",
}


def parse_pct(token: str):
    t = token.strip().replace(" ", "")
    if t in ("-%", "%") or (t.startswith("-") and not re.match(r"-?\d", t)):
        return None
    t = t.rstrip("%").replace(",", ".")
    try:
        v = float(t)
    except ValueError:
        return None
    if v < 0 or v > 100:
        return None
    return v


def pct_to_fraction(pct: float):
    best = None
    for q in range(1, 61):
        a = round(pct * q / 100.0)
        if a < 0 or a > q:
            continue
        got = a / q * 100.0
        err = abs(got - pct)
        if err < 0.06:
            if best is None or err < best[0] or (abs(err - best[0]) < 1e-9 and q < best[1][1]):
                best = (err, (a, q))
    if best:
        return best[1]
    a = max(0, min(100, round(pct)))
    return a, 100


def clean_title(raw: str):
    if not raw:
        return None
    t = re.sub(r"\s+", " ", raw).strip()
    parts = re.split(r"MAPA DA BANCA", t, flags=re.I)
    t = parts[0].strip(" -–|")
    if not t:
        return None
    if JUNK_TITLE_RE.fullmatch(t):
        return None
    if JUNK_TITLE_RE.search(t):
        t = JUNK_TITLE_RE.sub("", t).strip(" -–|")
        t = re.sub(r"\s+", " ", t).strip()
        if not t or len(t) < 3:
            return None
    return t


def split_pages(text: str):
    pages = []
    cur = []
    for line in text.splitlines():
        if line.startswith("--- page "):
            if cur:
                pages.append(cur)
            cur = []
            continue
        cur.append(line)
    if cur:
        pages.append(cur)
    return pages


def parse_assuntos_from_lines(lines, start_mode="head"):
    title = None
    media = None
    assuntos = []
    mode = start_mode
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            i += 1
            continue
        if stripped.upper().startswith("MÉDIA DO") or stripped.upper().startswith("MEDIA DO"):
            i += 1
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i < len(lines):
                mline = lines[i].strip()
                if mline.upper().startswith("TÓPICO") or mline.upper().startswith("TOPICO"):
                    rest = re.sub(r"^(T[ÓO]PICO)\s*", "", mline, flags=re.I).strip()
                    media = None if rest in ("", "#DIV/0!") else (parse_pct(rest) if "%" in rest else None)
                elif mline == "#DIV/0!":
                    media = None
                elif "%" in mline:
                    media = parse_pct(mline)
            mode = "wait_header"
            i += 1
            continue
        if mode == "head":
            if AULA_START.match(stripped):
                mode = "rows"
                continue
            ct = clean_title(stripped)
            if ct and title is None:
                title = ct
            i += 1
            continue
        if mode == "wait_header":
            if stripped.upper().startswith("AULA") or AULA_START.match(stripped):
                mode = "rows"
                if stripped.upper().startswith("AULA"):
                    i += 1
                continue
            i += 1
            continue
        if mode == "rows":
            m = AULA_START.match(stripped)
            if not m:
                if assuntos and not PCT_RE.search(stripped):
                    if not re.search(r"Maioria|pouquissimas|feito com|ate aqui", stripped, re.I):
                        assuntos[-1]["nome"] = (assuntos[-1]["nome"] + " " + stripped).strip()
                i += 1
                continue
            aula = int(m.group(1))
            rest = m.group(2).strip()
            tokens = list(PCT_RE.finditer(rest))
            name = rest
            pcts = []
            if tokens:
                name = rest[: tokens[0].start()].strip()
                for t in tokens:
                    p = parse_pct(t.group(0))
                    if p is not None:
                        pcts.append(p)
            name = re.sub(r"\s+", " ", name).strip(" -–")
            name = re.sub(r"\s+ate aqui$", "", name, flags=re.I).strip()
            if not name:
                i += 1
                continue
            if len(pcts) == 0:
                u20, scores = None, []
            elif len(pcts) == 1:
                u20, scores = pcts[0], [pcts[0]]
            else:
                u20, scores = pcts[0], pcts[1:]
            hist = []
            for s in scores:
                a, q = pct_to_fraction(s)
                hist.append(
                    {
                        "acertos": a,
                        "quantidade": q,
                        "percentual": round(a / q * 100, 4),
                        "source_pct": s,
                    }
                )
            assuntos.append({"aula": aula, "nome": name, "u20_pdf": u20, "historico": hist})
            i += 1
            continue
        i += 1
    return {"title": title, "media_pdf": media, "assuntos": assuntos}


def parse_pages(text: str):
    parsed = []
    for lines in split_pages(text):
        p = parse_assuntos_from_lines(lines, "head")
        if p["assuntos"]:
            parsed.append(p)
        else:
            p2 = parse_assuntos_from_lines(lines, "rows")
            if p2["assuntos"]:
                parsed.append(p2)
    return parsed


def names_key(page):
    return tuple(a["nome"].lower() for a in page["assuntos"])


def build_materia(materia_name, pages, strategy):
    topicos = []
    if strategy == "portugues":
        i = 0
        while i < len(pages):
            cur = {
                "title": pages[i]["title"],
                "media_pdf": pages[i]["media_pdf"],
                "assuntos": list(pages[i]["assuntos"]),
            }
            while i + 1 < len(pages):
                nxt = pages[i + 1]
                if (
                    cur["assuntos"]
                    and nxt["assuntos"]
                    and nxt["assuntos"][0]["aula"] > cur["assuntos"][-1]["aula"]
                ):
                    cur["assuntos"].extend(nxt["assuntos"])
                    i += 1
                else:
                    break
            title = cur["title"]
            if not title:
                names = " ".join(a["nome"] for a in cur["assuntos"][:5])
                if any(k in names for k in ("Ortografia", "Morfologia", "Sintaxe", "Crase", "Pontuação")):
                    title = "Gramática"
                elif any(k in names for k in ("Semântica", "Coesão", "Interpretação", "Tipologia")):
                    title = "Interpretação e Semântica"
                elif any(k in names for k in ("Ofício", "Ata", "Redação", "Edital", "Portaria")):
                    title = "Redação Oficial"
                else:
                    title = f"Tópico {len(topicos)+1}"
            topicos.append({**cur, "title": title})
            i += 1
    elif strategy == "f_adm":
        seen = set()
        for p in pages:
            key = names_key(p)
            if key in seen:
                continue
            seen.add(key)
            title = p["title"]
            names = " ".join(a["nome"] for a in p["assuntos"][:8])
            if any(k in names for k in ("Comportamento", "Gestão de Pessoas", "Recrutamento", "Seleção")):
                title = "Gestão de Pessoas"
            elif any(k in names for k in ("Processo Administrativo", "Gestão de Processos", "Gestão de Projetos")):
                title = "Gestão de processos e projetos"
            elif not title:
                title = f"Tópico {len(topicos)+1}"
            topicos.append({**p, "title": title})
    elif strategy == "constitucional":
        if len(pages) >= 1:
            topicos.append({**pages[0], "title": pages[0]["title"] or "Princípios Fundamentais"})
        if len(pages) >= 2:
            topicos.append({**pages[1], "title": pages[1]["title"] or "Aplicabilidade das Normas"})
        if len(pages) >= 3:
            base = pages[2]
            by_name = {}
            ordered_names = []
            for a in base["assuntos"]:
                by_name[a["nome"]] = {
                    "aula": a["aula"],
                    "nome": a["nome"],
                    "u20_pdf": a.get("u20_pdf"),
                    "historico": list(a["historico"]),
                }
                ordered_names.append(a["nome"])
            if len(pages) >= 4:
                for a in pages[3]["assuntos"]:
                    if a["nome"] in by_name:
                        by_name[a["nome"]]["historico"].extend(a["historico"])
                    else:
                        by_name[a["nome"]] = {
                            "aula": 1000 + a["aula"],
                            "nome": a["nome"],
                            "u20_pdf": a.get("u20_pdf"),
                            "historico": list(a["historico"]),
                        }
                        ordered_names.append(a["nome"])
            topicos.append(
                {
                    "title": "Direitos e Garantias Fundamentais",
                    "media_pdf": base["media_pdf"],
                    "assuntos": [by_name[n] for n in ordered_names],
                }
            )
    elif strategy == "cremerj":
        for idx, p in enumerate(pages):
            title = p["title"]
            if not title and p["assuntos"]:
                n = p["assuntos"][0]["nome"]
                title = re.sub(r"\s+II+$", "", n)
                title = re.sub(r"\s+\(.*", "", title).strip()
            topicos.append({**p, "title": title or f"Tópico {idx+1}"})
    else:
        for idx, p in enumerate(pages):
            title = p["title"]
            if not title and p["assuntos"]:
                n = p["assuntos"][0]["nome"]
                title = re.split(r"\s+II+\b|\s+\(", n)[0].strip()
                title = re.sub(r"\s+II+$", "", title).strip()
            topicos.append({**p, "title": title or f"Tópico {idx+1}"})

    out = []
    for ti, t in enumerate(topicos):
        assuntos_out = []
        for oi, a in enumerate(t["assuntos"]):
            assuntos_out.append(
                {
                    "nome": a["nome"],
                    "sort_order": a.get("aula", oi + 1) - 1 if isinstance(a.get("aula"), int) else oi,
                    "u20_pdf": a.get("u20_pdf"),
                    "historico": [
                        {
                            "acertos": h["acertos"],
                            "quantidade": h["quantidade"],
                            "percentual": h["percentual"],
                        }
                        for h in a["historico"]
                    ],
                }
            )
        nome = t["title"]
        if materia_name == "D Administrativo":
            if str(nome).startswith("Lei Nº 14.133") or str(nome).startswith("Lei nº 14.133"):
                nome = "Licitações e Contratos (Lei 14.133/2021)"
            if t["assuntos"] and t["assuntos"][0]["nome"].startswith("Atos Administrativos"):
                nome = "Atos Administrativos"
            if t["assuntos"] and t["assuntos"][0]["nome"].startswith("Bens Públicos"):
                nome = "Bens Públicos"
        out.append(
            {
                "nome": nome,
                "sort_order": ti,
                "media_pdf": t.get("media_pdf"),
                "assuntos": assuntos_out,
            }
        )
    return {"nome": materia_name, "topicos": out}


def load_text(stem: str, extract_dir: Path, pdf_dir: Path | None) -> str:
    txt = extract_dir / f"{stem}.txt"
    if txt.exists():
        return txt.read_text(encoding="utf-8")
    if pdf_dir:
        pdf = pdf_dir / f"{stem}.pdf"
        if pdf.exists():
            from pypdf import PdfReader

            reader = PdfReader(str(pdf))
            parts = []
            for i, page in enumerate(reader.pages):
                parts.append(f"--- page {i+1} ---\n{page.extract_text() or ''}")
            return "\n".join(parts)
    raise FileNotFoundError(stem)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extract-dir", type=Path, default=Path("/tmp/pdf-extract"))
    ap.add_argument("--pdf-dir", type=Path, default=None)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "src/data/cremerj-import.json",
    )
    args = ap.parse_args()

    materias = []
    stats = {"materias": 0, "topicos": 0, "assuntos": 0, "historico": 0, "assuntos_com_score": 0}
    for stem, mname in FILE_MAP:
        text = load_text(stem, args.extract_dir, args.pdf_dir)
        pages = parse_pages(text)
        m = build_materia(mname, pages, STRATEGIES[mname])
        materias.append(m)
        stats["materias"] += 1
        stats["topicos"] += len(m["topicos"])
        for t in m["topicos"]:
            stats["assuntos"] += len(t["assuntos"])
            for a in t["assuntos"]:
                if a["historico"]:
                    stats["assuntos_com_score"] += 1
                stats["historico"] += len(a["historico"])

    payload = {
        "version": 1,
        "source": "planilha PDF Gabriel — import CREMERJ",
        "gaps": [
            "PDF de RLM (02) não foi fornecido — matéria RLM permanece sem tópicos importados.",
            "PDFs não trazem acertos/quantidade brutos; frações reconstruídas a partir do % visível (ex.: 66,67% → 2/3).",
            "Importamos as colunas SCORES (e o único % quando há só um). U20 do PDF é metadado de referência, não entrada de histórico.",
            "Quando U20 do PDF ≠ média dos scores visíveis, prevalece o histórico importado (app recalcula U20).",
            "F Administração: páginas duplicadas da planilha foram deduplicadas.",
            "Constitucional: segunda folha de Direitos e Garantias mesclada no mesmo tópico por nome de assunto.",
            "Aulas sem nome / páginas vazias ignoradas. Notas livres do PDF não entram no modelo.",
            "Assuntos só com estrutura (sem %) ficam sem histórico — correto.",
        ],
        "stats": stats,
        "materias": materias,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, indent=2))
    print("wrote", args.out)


if __name__ == "__main__":
    main()
