"use client";

import { useState } from "react";

export function promptName(label: string): Promise<string | null> {
  const nome = window.prompt(label);
  if (nome === null) return Promise.resolve(null);
  const trimmed = nome.trim();
  if (!trimmed) {
    window.alert("Informe um nome.");
    return Promise.resolve(null);
  }
  return Promise.resolve(trimmed);
}

export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  className,
  title,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      title={title ?? label}
      aria-label={title ?? label}
      onClick={async () => {
        if (!window.confirm(confirm)) return;
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
