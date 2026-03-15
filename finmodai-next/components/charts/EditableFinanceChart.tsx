'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

type PlotTrace = Record<string, unknown>;
type PlotLayout = Record<string, unknown>;
type PlotConfig = Record<string, unknown>;

type EditableFinanceChartProps = {
  data: PlotTrace[];
  layout?: PlotLayout;
  config?: PlotConfig;
  className?: string;
  title?: string;
  subtitle?: string;
  height?: number;
  editable?: boolean;
};

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const DEFAULT_CONFIG: PlotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  scrollZoom: true,
  editable: true,
  edits: {
    annotationPosition: true,
    annotationTail: true,
    annotationText: true,
    axisTitleText: true,
    colorbarPosition: true,
    colorbarTitleText: true,
    legendPosition: true,
    shapePosition: true,
    titleText: true,
  },
  modeBarButtonsToAdd: ['drawline', 'drawopenpath', 'drawrect', 'eraseshape'],
};

const BASE_LAYOUT: PlotLayout = {
  autosize: true,
  dragmode: 'zoom',
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  margin: { l: 56, r: 24, t: 24, b: 40 },
  font: {
    family: 'Inter, ui-sans-serif, system-ui, sans-serif',
    color: '#d4d4d8',
    size: 12,
  },
  xaxis: {
    gridcolor: 'rgba(255,255,255,0.08)',
    linecolor: 'rgba(255,255,255,0.12)',
    zerolinecolor: 'rgba(255,255,255,0.12)',
    tickfont: { color: '#a1a1aa', size: 11 },
    title: { font: { color: '#a1a1aa', size: 11 } },
  },
  yaxis: {
    gridcolor: 'rgba(255,255,255,0.08)',
    linecolor: 'rgba(255,255,255,0.12)',
    zerolinecolor: 'rgba(255,255,255,0.12)',
    tickfont: { color: '#a1a1aa', size: 11 },
    title: { font: { color: '#a1a1aa', size: 11 } },
  },
  legend: {
    orientation: 'h',
    x: 0,
    y: 1.1,
    font: { color: '#a1a1aa', size: 11 },
  },
};

export function EditableFinanceChart({
  data,
  layout,
  config,
  className,
  title,
  subtitle,
  height = 360,
  editable = true,
}: EditableFinanceChartProps) {
  return (
    <div className={cn('rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3', className)}>
      {title ? (
        <div className="mb-3">
          <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{subtitle}</div> : null}
        </div>
      ) : null}
      <div style={{ height }}>
        <Plot
          data={data}
          layout={{
            ...BASE_LAYOUT,
            ...layout,
          }}
          config={{
            ...DEFAULT_CONFIG,
            editable,
            ...config,
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
