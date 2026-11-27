"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { MateriaNode, Profile, TopicoNode, TreePayload } from "@/lib/types";
import { Score } from "./Score";
import { ConfirmButton, promptName } from "./PromptName";

type Tab = "visao" | "estrutura" | "perfis";
type Detail =
  | { kind: "materia"; materiaId: string }
  | { kind: "topico"; materiaId: string; topicoId: string }
  | null;

export function GvsApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [viewer, setViewer] = useState<{ name: string; simulated: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("visao");
  const [detail, setDetail] = useState<Detail>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const p = await api.profiles();
    setProfiles(p.profiles);
    setActiveId(p.activeProfileId);
    setViewer(p.viewer);

    // One-shot: if CREMERJ exists and PDF data not yet imported, import into that profile only.
    const cremerj = p.profiles.find((x) =>
      `${x.nome} ${x.concurso} ${x.identificacao}`.toLowerCase().includes("cremerj"),
    );
    if (cremerj) {
      try {
        const status = await api.importCremerjStatus();
        if (status.profile && !status.imported) {
          await api.importCremerj({ profileId: cremerj.id });
        }
      } catch {
        // Import is best-effort on load; manual button remains on Perfis.
      }
    }

    if (p.activeProfileId) {
      const t = await api.tree(p.activeProfileId);
      setTree(t);
    } else {
      setTree(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }

  if (loading) {
    return (
      <div className="shell">
        <p className="muted">Carregando GVS…</p>
      </div>
    );
  }

  const active = profiles.find((p) => p.id === activeId) ?? null;
  const materia =
    detail && tree
      ? tree.materias.find((m) => m.id === detail.materiaId) ?? null
      : null;
  const topico =
    detail?.kind === "topico" && materia
      ? materia.topicos.find((t) => t.id === detail.topicoId) ?? null
      : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand">GVS</div>
          <div className="brand-sub">Score Manager</div>
        </div>
        <nav className="tabs" aria-label="Navegação">
          <button
            type="button"
            className={tab === "visao" && !detail ? "tab on" : "tab"}
            onClick={() => {
              setTab("visao");
              setDetail(null);
            }}
          >
            Visão Geral
          </button>
          <button
            type="button"
            className={tab === "estrutura" ? "tab on" : "tab"}
            onClick={() => {
              setTab("estrutura");
              setDetail(null);
            }}
          >
            Estrutura
          </button>
          <button
            type="button"
            className={tab === "perfis" ? "tab on" : "tab"}
            onClick={() => {
              setTab("perfis");
              setDetail(null);
            }}
          >
            Perfis
          </button>
        </nav>
        <div className="top-meta">
          {active ? (
            <select
              className="profile-select"
              value={active.id}
              aria-label="Perfil ativo"
              onChange={(e) =>
                run(async () => {
                  await api.activateProfile(e.target.value);
                  setDetail(null);
                  setTab("visao");
                })
              }
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.concurso ? ` · ${p.concurso}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">Sem perfil</span>
          )}
          {viewer?.simulated ? (
            <span className="badge-sim" title="Identidade local simulada">
              Dev
            </span>
          ) : null}
        </div>
      </header>

      {error ? <div className="banner-error">{error}</div> : null}

      <main className="main">
        {tab === "perfis" ? (
          <PerfisView profiles={profiles} activeId={activeId} run={run} />
        ) : !active || !tree ? (
          <EmptyProfiles
            onCreate={() =>
              run(async () => {
                const nome = await promptName("Nome do perfil (ex.: gabriel)");
                if (!nome) return;
                const concurso = window.prompt("Concurso / órgão (ex.: CREMERJ)") ?? "";
                const cargo = window.prompt("Cargo") ?? "";
                await api.createProfile({
                  nome,
                  concurso: concurso.trim(),
                  cargo: cargo.trim(),
                  seedMaterias: true,
                });
                setTab("visao");
              })
            }
          />
        ) : detail && materia ? (
          <DetailView
            materia={materia}
            topico={topico}
            onBack={() => {
              if (detail.kind === "topico") {
                setDetail({ kind: "materia", materiaId: materia.id });
              } else {
                setDetail(null);
                setTab("visao");
              }
            }}
            onOpenTopico={(tid) =>
              setDetail({ kind: "topico", materiaId: materia.id, topicoId: tid })
            }
            run={run}
          />
        ) : tab === "estrutura" ? (
          <EstruturaView tree={tree} run={run} />
        ) : (
          <VisaoGeral
            tree={tree}
            onOpenMateria={(id) => setDetail({ kind: "materia", materiaId: id })}
            onOpenTopico={(mid, tid) =>
              setDetail({ kind: "topico", materiaId: mid, topicoId: tid })
            }
            run={run}
          />
        )}
      </main>
    </div>
  );
}

function EmptyProfiles({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="panel empty-panel">
      <h1>Comece por um perfil</h1>
      <p className="muted">
        Cada perfil isola um concurso. As 7 matérias sugeridas entram no cadastro; tópicos e
        assuntos você adiciona com nome.
      </p>
      <button type="button" className="btn primary" onClick={onCreate}>
        Criar perfil
      </button>
    </section>
  );
}

function VisaoGeral({
  tree,
  onOpenMateria,
  onOpenTopico,
  run,
}: {
  tree: TreePayload;
  onOpenMateria: (id: string) => void;
  onOpenTopico: (materiaId: string, topicoId: string) => void;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="visao">
      <div className="page-head">
        <div>
          <h1>Visão Geral</h1>
          <p className="muted">
            {tree.profile.concurso || "Sem concurso"} · {tree.profile.cargo || "Sem cargo"}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            run(async () => {
              const nome = await promptName("Nome da nova matéria");
              if (!nome) return;
              await api.addMateria(tree.profile.id, nome);
            })
          }
        >
          + Matéria
        </button>
      </div>
      <div className="materia-grid">
        {tree.materias.map((m) => (
          <article key={m.id} className="materia-block">
            <header className="materia-head">
              <button type="button" className="linkish" onClick={() => onOpenMateria(m.id)}>
                {m.nome}
              </button>
              <div className="media-label">
                <span>MÉDIA</span>
                <Score value={m.media} size="lg" />
              </div>
            </header>
            {m.topicos.length === 0 ? (
              <p className="muted dense">
                Sem tópicos.{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() =>
                    run(async () => {
                      const nome = await promptName("Nome do tópico");
                      if (!nome) return;
                      await api.addTopico(m.id, nome);
                    })
                  }
                >
                  Adicionar tópico
                </button>
              </p>
            ) : (
              <ul className="topic-list">
                {m.topicos.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="topic-row"
                      onClick={() => onOpenTopico(m.id, t.id)}
                    >
                      <span>{t.nome}</span>
                      <Score value={t.media} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailView({
  materia,
  topico,
  onBack,
  onOpenTopico,
  run,
}: {
  materia: MateriaNode;
  topico: TopicoNode | null;
  onBack: () => void;
  onOpenTopico: (id: string) => void;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  if (topico) {
    return (
      <section className="detail">
        <button type="button" className="back" onClick={onBack}>
          ← {materia.nome}
        </button>
        <div className="page-head">
          <div>
            <h1>{topico.nome}</h1>
            <p className="muted">
              MÉDIA DO TÓPICO <Score value={topico.media} />
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              run(async () => {
                const nome = await promptName("Nome do assunto");
                if (!nome) return;
                await api.addAssunto(topico.id, nome);
              })
            }
          >
            + Assunto
          </button>
        </div>
        {topico.assuntos.length === 0 ? (
          <p className="muted">Nenhum assunto ainda. Adicione e registre exercícios.</p>
        ) : (
          <div className="assunto-list">
            {topico.assuntos.map((a) => (
              <article key={a.id} className="assunto-row">
                <div className="assunto-main">
                  <div className="assunto-title">{a.nome}</div>
                  <div className="u20">
                    <span>ACUMULADO U20</span>
                    <Score value={a.u20} size="lg" />
                  </div>
                </div>
                <div className="recentes">
                  {a.recentes.length === 0 ? (
                    <span className="muted">Sem histórico</span>
                  ) : (
                    a.recentes.map((h) => (
                      <span key={h.id} className="chip">
                        <Score value={h.percentual} size="sm" />
                        <span className="chip-meta">
                          {h.acertos}/{h.quantidade}
                        </span>
                      </span>
                    ))
                  )}
                </div>
                <form
                  className="entry-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const acertos = Number(fd.get("acertos"));
                    const quantidade = Number(fd.get("quantidade"));
                    run(async () => {
                      await api.addHistorico(a.id, acertos, quantidade);
                      form.reset();
                    });
                  }}
                >
                  <label>
                    Acertos
                    <input name="acertos" type="number" min={0} required inputMode="numeric" />
                  </label>
                  <label>
                    Questões
                    <input name="quantidade" type="number" min={1} required inputMode="numeric" />
                  </label>
                  <button type="submit" className="btn primary">
                    Registrar
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="detail">
      <button type="button" className="back" onClick={onBack}>
        ← Visão Geral
      </button>
      <div className="page-head">
        <div>
          <h1>{materia.nome}</h1>
          <p className="muted">
            MÉDIA <Score value={materia.media} />
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            run(async () => {
              const nome = await promptName("Nome do tópico");
              if (!nome) return;
              await api.addTopico(materia.id, nome);
            })
          }
        >
          + Tópico
        </button>
      </div>
      <ul className="topic-list big">
        {materia.topicos.map((t) => (
          <li key={t.id}>
            <button type="button" className="topic-row" onClick={() => onOpenTopico(t.id)}>
              <span>{t.nome}</span>
              <Score value={t.media} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstruturaView({
  tree,
  run,
}: {
  tree: TreePayload;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="estrutura">
      <div className="page-head">
        <div>
          <h1>Estrutura</h1>
          <p className="muted">Adicionar, renomear ou excluir matérias, tópicos e assuntos.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            run(async () => {
              const nome = await promptName("Nome da matéria");
              if (!nome) return;
              await api.addMateria(tree.profile.id, nome);
            })
          }
        >
          + Matéria
        </button>
      </div>
      {tree.materias.map((m) => (
        <article key={m.id} className="struct-block">
          <div className="struct-row">
            <strong>{m.nome}</strong>
            <div className="row-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  run(async () => {
                    const nome = await promptName(`Renomear matéria (${m.nome})`);
                    if (!nome) return;
                    await api.renameMateria(m.id, nome);
                  })
                }
              >
                Renomear
              </button>
              <ConfirmButton
                label="Excluir"
                confirm={`Excluir matéria “${m.nome}” e todo o conteúdo?`}
                className="btn danger"
                onConfirm={() => run(async () => api.deleteMateria(m.id).then(() => undefined))}
              />
              <button
                type="button"
                className="btn"
                onClick={() =>
                  run(async () => {
                    const nome = await promptName("Nome do tópico");
                    if (!nome) return;
                    await api.addTopico(m.id, nome);
                  })
                }
              >
                + Tópico
              </button>
            </div>
          </div>
          {m.topicos.map((t) => (
            <div key={t.id} className="struct-topico">
              <div className="struct-row">
                <span>{t.nome}</span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      run(async () => {
                        const nome = await promptName(`Renomear tópico (${t.nome})`);
                        if (!nome) return;
                        await api.renameTopico(t.id, nome);
                      })
                    }
                  >
                    Renomear
                  </button>
                  <ConfirmButton
                    label="Excluir"
                    confirm={`Excluir tópico “${t.nome}”?`}
                    className="btn danger"
                    onConfirm={() => run(async () => api.deleteTopico(t.id).then(() => undefined))}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      run(async () => {
                        const nome = await promptName("Nome do assunto");
                        if (!nome) return;
                        await api.addAssunto(t.id, nome);
                      })
                    }
                  >
                    + Assunto
                  </button>
                </div>
              </div>
              <ul className="struct-assuntos">
                {t.assuntos.map((a) => (
                  <li key={a.id} className="struct-row nested">
                    <span>{a.nome}</span>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          run(async () => {
                            const nome = await promptName(`Renomear assunto (${a.nome})`);
                            if (!nome) return;
                            await api.renameAssunto(a.id, nome);
                          })
                        }
                      >
                        Renomear
                      </button>
                      <ConfirmButton
                        label="Excluir"
                        confirm={`Excluir assunto “${a.nome}”?`}
                        className="btn danger"
                        onConfirm={() =>
                          run(async () => api.deleteAssunto(a.id).then(() => undefined))
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

function PerfisView({
  profiles,
  activeId,
  run,
}: {
  profiles: Profile[];
  activeId: string | null;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    nome: "",
    identificacao: "",
    concurso: "",
    cargo: "",
  });
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const cremerj = profiles.find((p) =>
    `${p.nome} ${p.concurso} ${p.identificacao}`.toLowerCase().includes("cremerj"),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.importCremerjStatus();
        if (cancelled) return;
        if (!s.profile) {
          setImportInfo(null);
          return;
        }
        setImportInfo(
          s.imported
            ? `PDF CREMERJ já importado${s.importedAt ? ` (${new Date(s.importedAt).toLocaleString("pt-BR")})` : ""}.`
            : "Há dados da planilha PDF prontos para importar neste perfil.",
        );
      } catch {
        if (!cancelled) setImportInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  return (
    <section className="perfis">
      <div className="page-head">
        <div>
          <h1>Perfis</h1>
          <p className="muted">
            Dados sincronizados na conta (nuvem). Troque de perfil ao mudar de concurso.
          </p>
        </div>
      </div>
      <div className="perfis-grid">
        <div className="panel">
          <h2>Seus perfis</h2>
          {profiles.length === 0 ? (
            <p className="muted">Nenhum perfil ainda.</p>
          ) : (
            <ul className="profile-list">
              {profiles.map((p) => (
                <li key={p.id} className={p.id === activeId ? "active" : ""}>
                  <div>
                    <strong>{p.nome}</strong>
                    <div className="muted dense">
                      {[p.identificacao, p.concurso, p.cargo].filter(Boolean).join(" · ") ||
                        "Sem metadados"}
                    </div>
                  </div>
                  <div className="row-actions">
                    {p.id !== activeId ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => run(async () => api.activateProfile(p.id).then(() => undefined))}
                      >
                        Ativar
                      </button>
                    ) : (
                      <span className="badge-on">Ativo</span>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        run(async () => {
                          const nome = await promptName(`Nome (${p.nome})`);
                          if (!nome) return;
                          const identificacao =
                            window.prompt("Identificação", p.identificacao) ?? p.identificacao;
                          const concurso =
                            window.prompt("Concurso / órgão", p.concurso) ?? p.concurso;
                          const cargo = window.prompt("Cargo", p.cargo) ?? p.cargo;
                          await api.updateProfile(p.id, {
                            nome,
                            identificacao,
                            concurso,
                            cargo,
                          });
                        })
                      }
                    >
                      Editar
                    </button>
                    <ConfirmButton
                      label="Excluir"
                      confirm={`Excluir perfil “${p.nome}”?`}
                      className="btn danger"
                      onConfirm={() =>
                        run(async () => api.deleteProfile(p.id).then(() => undefined))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cremerj ? (
            <div className="import-box">
              <h3>Importar planilha PDF (CREMERJ)</h3>
              <p className="muted dense">
                Preenche tópicos, assuntos e scores do PDF no perfil{" "}
                <strong>{cremerj.nome}</strong>
                {cremerj.concurso ? ` · ${cremerj.concurso}` : ""}. Idempotente — não apaga outros
                perfis nem sobrescreve histórico já existente.
              </p>
              {importInfo ? <p className="muted dense">{importInfo}</p> : null}
              <button
                type="button"
                className="btn primary"
                disabled={importBusy}
                onClick={() =>
                  run(async () => {
                    setImportBusy(true);
                    try {
                      const r = await api.importCremerj({ profileId: cremerj.id });
                      if (r.alreadyImported) {
                        setImportInfo("PDF CREMERJ já estava importado (nada alterado).");
                        return;
                      }
                      setImportInfo(
                        `Importado: +${r.created.topicos} tópicos, +${r.created.assuntos} assuntos, +${r.created.historico} entradas de histórico.`,
                      );
                    } finally {
                      setImportBusy(false);
                    }
                  })
                }
              >
                {importBusy ? "Importando…" : "Importar dados do PDF"}
              </button>
            </div>
          ) : null}
        </div>
        <form
          className="panel form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.nome.trim()) return;
            run(async () => {
              await api.createProfile({ ...form, seedMaterias: true });
              setForm({ nome: "", identificacao: "", concurso: "", cargo: "" });
            });
          }}
        >
          <h2>Novo perfil</h2>
          <label>
            Nome
            <input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
              placeholder="ex.: gabriel"
            />
          </label>
          <label>
            Identificação
            <input
              value={form.identificacao}
              onChange={(e) => setForm((f) => ({ ...f, identificacao: e.target.value }))}
              placeholder="opcional"
            />
          </label>
          <label>
            Concurso / órgão
            <input
              value={form.concurso}
              onChange={(e) => setForm((f) => ({ ...f, concurso: e.target.value }))}
              placeholder="ex.: CREMERJ"
            />
          </label>
          <label>
            Cargo
            <input
              value={form.cargo}
              onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
              placeholder="ex.: Analista"
            />
          </label>
          <p className="muted dense">Inclui as 7 matérias sugeridas; tópicos começam vazios.</p>
          <button type="submit" className="btn primary">
            Criar perfil
          </button>
        </form>
      </div>
    </section>
  );
}
