import { z } from 'zod';

export type LineSeries = { key: string; label: string; color?: string };
export type BarSeries = { key: string; label: string; color?: string };
export type WaterfallStep = { label: string; value: number };

export type ChartSpec =
  | {
      type: 'line';
      title: string;
      xKey: string;
      series: LineSeries[];
      data: Record<string, any>[];
    }
  | {
      type: 'bar';
      title: string;
      xKey: string;
      series: BarSeries[];
      data: Record<string, any>[];
    }
  | {
      type: 'waterfall';
      title: string;
      steps: WaterfallStep[];
    }
  | {
      type: 'heatmap';
      title: string;
      xLabels: string[];
      yLabels: string[];
      values: number[][];
      format?: 'currency' | 'percent' | 'number';
    };

export const ChartSpecSchema = z.union([
  z.object({
    type: z.literal('line'),
    title: z.string(),
    xKey: z.string(),
    series: z.array(z.object({ key: z.string(), label: z.string(), color: z.string().optional() })),
    data: z.array(z.record(z.any())),
  }),
  z.object({
    type: z.literal('bar'),
    title: z.string(),
    xKey: z.string(),
    series: z.array(z.object({ key: z.string(), label: z.string(), color: z.string().optional() })),
    data: z.array(z.record(z.any())),
  }),
  z.object({
    type: z.literal('waterfall'),
    title: z.string(),
    steps: z.array(z.object({ label: z.string(), value: z.number() })),
  }),
  z.object({
    type: z.literal('heatmap'),
    title: z.string(),
    xLabels: z.array(z.string()),
    yLabels: z.array(z.string()),
    values: z.array(z.array(z.number())),
    format: z.enum(['currency', 'percent', 'number']).optional(),
  }),
]);
