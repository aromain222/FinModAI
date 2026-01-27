"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Check = { label: string; status: "pass" | "warn" | "fail" };

interface ReportShellProps {
  title: string;
  subtitle?: string;
  modelType?: string;
  ticker?: string;
  createdAt?: string;
  checks?: Check[];
  children: React.ReactNode;
}

export function ReportShell({ title, subtitle, modelType, ticker, createdAt, checks = [], children }: ReportShellProps) {
  return (
    <div className="space-y-4">
      <header className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-[var(--cb-text-primary)]">{title}</h1>
              {modelType ? (
                <Badge variant="outline" className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-muted)]">
                  {modelType.toUpperCase()}
                </Badge>
              ) : null}
              {ticker ? (
                <Badge variant="outline" className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)]">
                  {ticker}
                </Badge>
              ) : null}
            </div>
            {subtitle ? <p className="text-sm text-[var(--cb-text-muted)]">{subtitle}</p> : null}
            {createdAt ? (
              <p className="text-xs text-[var(--cb-text-muted)]">Created {new Date(createdAt).toLocaleString()}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">Export</Button>
            <Button size="sm">Share</Button>
          </div>
        </div>
        {checks.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {checks.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-sm text-[var(--cb-text-body)]"
              >
                <span>{c.label}</span>
                <span
                  className={
                    c.status === "pass"
                      ? "text-[var(--cb-green)]"
                      : c.status === "warn"
                      ? "text-amber-300"
                      : "text-red-400"
                  }
                >
                  {c.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
