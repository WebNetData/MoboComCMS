"use client";
import type { ReactNode } from "react";
import s from "./Pay.module.css";

import { labels } from "./client";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Badge({ value }: { value: string }) {
  const tone = ["PAID", "ACTIVE", "MATCHED"].includes(value)
    ? s.positive
    : ["REJECTED", "SUSPENDED", "EXPIRED"].includes(value)
      ? s.danger
      : ["PENDING", "REQUESTED", "APPROVED", "UNMATCHED"].includes(value)
        ? s.warning
        : "";
  return <span className={`${s.badge} ${tone}`}>{labels[value] || value}</span>;
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <p className={`${s.notice} ${s.error}`} role="alert">
      {error}
    </p>
  ) : null;
}
