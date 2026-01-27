"use client";

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
  className?: string;
}

export interface SafeTableProps {
  title?: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
  emptyMessage?: string;
  highlightRow?: (row: Record<string, any>) => boolean;
  maxHeight?: string;
}

/**
 * SafeTable - Never crashes on empty/undefined data
 */
export function SafeTable({
  title,
  columns,
  rows = [],
  emptyMessage = 'No data available',
  highlightRow,
  maxHeight,
}: SafeTableProps) {
  const safeRows = Array.isArray(rows) ? rows : [];
  
  const content = (
    <div className={maxHeight ? `overflow-auto ${maxHeight}` : 'overflow-x-auto'}>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`border-b border-[var(--cb-border-subtle)] ${
                  col.align === 'right' ? 'text-right' :
                  col.align === 'center' ? 'text-center' :
                  ''
                } ${col.className || ''}`}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {safeRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-8 text-[var(--cb-text-muted)]"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            safeRows.map((row, idx) => {
              const isHighlighted = highlightRow?.(row) ?? false;
              return (
                <TableRow
                  key={row.id || idx}
                  className={isHighlighted ? 'bg-[var(--cb-green)]/10' : undefined}
                >
                  {columns.map((col) => {
                    const value = row[col.key];
                    const formatted = col.format ? col.format(value) : String(value ?? '—');
                    return (
                      <TableCell
                        key={col.key}
                        className={`${
                          col.align === 'right' ? 'text-right' :
                          col.align === 'center' ? 'text-center' :
                          ''
                        } ${col.className || ''}`}
                      >
                        {formatted}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (title) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return content;
}

/**
 * Empty State Component
 */
interface EmptyStateProps {
  title?: string;
  description: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardContent className="py-12 text-center">
        {icon && <div className="flex justify-center mb-4">{icon}</div>}
        {title && (
          <p className="text-sm text-[var(--cb-text-primary)] font-medium mb-2">{title}</p>
        )}
        <p className="text-xs text-[var(--cb-text-muted)]">{description}</p>
      </CardContent>
    </Card>
  );
}
