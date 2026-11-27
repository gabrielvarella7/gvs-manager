"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { AssuntoNode, MateriaNode, Profile, TreePayload } from "@/lib/types";
import { Score } from "./Score";
import { ConfirmButton, promptName } from "./PromptName";

const ASSUNTOS_PAGE = 10;

/** Rótulos de aba mais legíveis; o nome na base continua o da matéria. */
function materiaTabLabel(nome: string): string {
  if (nome === "F Administração") return "Fundamentos da Administração";
  return nome;
}

type NavTab =
  | { kind: "resumo" }
  | { kind: "materia"; materiaId: string }
  | { kind: "estrutura" }
  | { kind: "perfis" };

export function GvsApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [viewer, setViewer] = useState<{ name: string; simulated: boolean } | null>(null);
  const [nav, setNav] = useState<NavTab>({ kind: "resumo" });

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

  // If the active matéria tab disappears (ex.: excluída), volta ao Resumo.
  useEffect(() => {
    if (nav.kind !== "materia" || !tree) return;
    if (!tree.materias.some((m) => m.id === nav.materiaId)) {
      setNav({ kind: "resumo" });
    }
  }, [nav, tree]);

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
  const materias = tree?.materias ?? [];
  const materiaAtiva =
    nav.kind === "materia" ? (materias.find((m) => m.id === nav.materiaId) ?? null) : null;

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
            className={nav.kind === "resumo" ? "tab on" : "tab"}
            onClick={() => setNav({ kind: "resumo" })}
          >
            Resumo
          </button>
          {materias.map((m) => (
            <button
              key={m.id}
              type="button"
              className={
                nav.kind === "materia" && nav.materiaId === m.id ? "tab on" : "tab"
              }
              title={m.nome}
              onClick={() => setNav({ kind: "materia", materiaId: m.id })}
            >
              {materiaTabLabel(m.nome)}
            </button>
          ))}
          <button
            type="button"
            className={nav.kind === "estrutura" ? "tab on" : "tab"}
            onClick={() => setNav({ kind: "estrutura" })}
          >
            Estrutura
          </button>
          <button
            type="button"
            className={nav.kind === "perfis" ? "tab on" : "tab"}
            onClick={() => setNav({ kind: "perfis" })}
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
                  setNav({ kind: "resumo" });
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
        {nav.kind === "perfis" ? (
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
                setNav({ kind: "resumo" });
              })
            }
          />
        ) : nav.kind === "estrutura" ? (
          <EstruturaView tree={tree} run={run} />
        ) : nav.kind === "materia" && materiaAtiva ? (
          <MateriaTabView materia={materiaAtiva} run={run} />
        ) : (
          <VisaoGeral
            tree={tree}
            onOpenMateria={(id) => setNav({ kind: "materia", materiaId: id })}
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
  run,
}: {
  tree: TreePayload;
  onOpenMateria: (id: string) => void;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="visao">
      <div className="page-head">
        <div>
          <h1>Resumo</h1>
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
                {materiaTabLabel(m.nome)}
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
                      onClick={() => onOpenMateria(m.id)}
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

function MateriaTabView({
  materia,
  run,
}: {
  materia: MateriaNode;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ASSUNTOS_PAGE);

  // Ao trocar de matéria, fecha expansão.
  useEffect(() => {
    setExpandedId(null);
    setVisibleCount(ASSUNTOS_PAGE);
  }, [materia.id]);

  function expand(topicoId: string) {
    setExpandedId(topicoId);
    setVisibleCount(ASSUNTOS_PAGE);
  }

  function collapse() {
    setExpandedId(null);
    setVisibleCount(ASSUNTOS_PAGE);
  }

  return (
    <section className="detail materia-tab">
      <div className="page-head">
        <div>
          <h1>{materiaTabLabel(materia.nome)}</h1>
          <p className="muted">
            MÉDIA <Score value={materia.media} />
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              run(async () => {
                const nome = await promptName(`Renomear matéria (${materia.nome})`);
                if (!nome) return;
                await api.renameMateria(materia.id, nome);
              })
            }
          >
            Renomear
          </button>
          <ConfirmButton
            label="Excluir"
            confirm={`Excluir matéria “${materia.nome}” e todo o conteúdo?`}
            className="btn danger"
            onConfirm={() => run(async () => api.deleteMateria(materia.id).then(() => undefined))}
          />
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
      </div>

      {materia.topicos.length === 0 ? (
        <p className="muted">Nenhum tópico ainda. Adicione o primeiro com nome.</p>
      ) : (
        <ul className="topico-expand-list">
          {materia.topicos.map((t) => {
            const open = expandedId === t.id;
            const shown = open ? t.assuntos.slice(0, visibleCount) : [];
            const hasMore = open && visibleCount < t.assuntos.length;

            return (
              <li key={t.id} className={open ? "topico-card open" : "topico-card"}>
                <div className="topico-card-head">
                  <div className="topico-card-title">
                    <span className="topico-name">{t.nome}</span>
                    <span className="topico-meta">
                      MÉDIA DO TÓPICO <Score value={t.media} />
                      <span className="muted dense inline-count">
                        {t.assuntos.length} assunto{t.assuntos.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
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
                      onConfirm={() =>
                        run(async () => api.deleteTopico(t.id).then(() => undefined))
                      }
                    />
                    {open ? (
                      <button type="button" className="btn" onClick={collapse}>
                        recolher
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => expand(t.id)}
                      >
                        expandir
                      </button>
                    )}
                  </div>
                </div>

                {open ? (
                  <div className="topico-expanded">
                    <div className="topico-expanded-toolbar">
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

                    {t.assuntos.length === 0 ? (
                      <p className="muted dense">Nenhum assunto ainda. Adicione e registre exercícios.</p>
                    ) : (
                      <>
                        <div className="assunto-list">
                          {shown.map((a) => (
                            <AssuntoCard key={a.id} assunto={a} run={run} />
                          ))}
                        </div>
                        <div className="topico-expand-actions">
                          {hasMore ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() =>
                                setVisibleCount((n) =>
                                  Math.min(n + ASSUNTOS_PAGE, t.assuntos.length),
                                )
                              }
                            >
                              mais topicos
                            </button>
                          ) : null}
                          <button type="button" className="btn" onClick={collapse}>
                            recolher
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AssuntoCard({
  assunto,
  run,
}: {
  assunto: AssuntoNode;
  run: (a: () => Promise<void>) => Promise<void>;
}) {
  return (
    <article className="assunto-row">
      <div className="assunto-main">
        <div className="assunto-head-left">
          <div className="assunto-title">{assunto.nome}</div>
          <div className="row-actions assunto-crud">
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                run(async () => {
                  const nome = await promptName(`Renomear assunto (${assunto.nome})`);
                  if (!nome) return;
                  await api.renameAssunto(assunto.id, nome);
                })
              }
            >
              Renomear
            </button>
          </div>
        </div>
        <div className="assunto-side">
          <ConfirmButton
            label="×"
            title={`Excluir assunto “${assunto.nome}”`}
            confirm={`Excluir assunto “${assunto.nome}”?`}
            className="btn-x"
            onConfirm={() =>
              run(async () => api.deleteAssunto(assunto.id).then(() => undefined))
            }
          />
          <div className="u20">
            <span>ACUMULADO U20</span>
            <Score value={assunto.u20} size="lg" />
          </div>
        </div>
      </div>
      <div className="recentes">
        {assunto.recentes.length === 0 ? (
          <span className="muted">Sem histórico</span>
        ) : (
          assunto.recentes.map((h) => (
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
            await api.addHistorico(assunto.id, acertos, quantidade);
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
            <strong>{materiaTabLabel(m.nome)}</strong>
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
