"use client";

import React from "react";
import { Tag } from "antd";
import { InfoCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";

type ControlRailProps = {
  title: string;
  subtitle?: string;
  leftSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
};

export function ControlRail({
  title,
  subtitle,
  leftSlot,
  centerSlot,
  rightSlot,
  loading,
  onRefresh,
}: ControlRailProps) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 md:p-5 shadow-sm space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[var(--cb-text-primary)]">{title}</h2>
          {subtitle ? <p className="text-sm text-[var(--cb-text-muted)]">{subtitle}</p> : null}
          {leftSlot}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag icon={<InfoCircleOutlined />} color={loading ? "processing" : "success"}>
            {loading ? "Loading…" : "Live"}
          </Tag>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <ReloadOutlined />
              <span className="ml-1">Refresh</span>
            </Button>
          )}
          {rightSlot}
        </div>
      </div>
      {centerSlot}
    </div>
  );
}
