"use client";

import React from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from "recharts";

type ScenarioChartsProps = {
  data: {
    ebitda: Array<{ year: string; base: number; scenario: number }>;
    cash: Array<{ year: string; base: number; scenario: number }>;
    exitEquity: Array<{ name: string; value: number }>;
  };
};

export function ScenarioCharts({ data }: ScenarioChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="EBITDA over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.ebitda}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="year" tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.08)" }} />
            <Legend />
            <Line type="monotone" dataKey="base" name="Base" stroke="#94a3b8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke="var(--cb-green)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cash balance over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.cash}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="year" tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.08)" }} />
            <Legend />
            <Line type="monotone" dataKey="base" name="Base" stroke="#94a3b8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke="var(--cb-green)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Exit Equity Value" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.exitEquity}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="name" tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--cb-text-muted)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.08)" }} />
            <Legend />
            <Bar dataKey="value" name="Exit Equity ($MM)" fill="var(--cb-green)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`h-64 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm ${className ?? ""}`}>
      <div className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">{title}</div>
      {children}
    </div>
  );
}
