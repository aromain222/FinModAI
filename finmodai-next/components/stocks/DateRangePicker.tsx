'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

type DateRange = '1M' | '3M' | '6M' | '1Y' | 'YTD';

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
};

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const ranges: Array<{ label: string; value: DateRange }> = [
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: 'YTD', value: 'YTD' },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Calendar className="w-4 h-4 text-slate-400" />
      <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
        {ranges.map((range) => (
          <Button
            key={range.value}
            variant={value === range.value ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 px-3 text-xs',
              value === range.value
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-black/60'
            )}
            onClick={() => onChange(range.value)}
          >
            {range.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function getDateRangeFromSelection(range: DateRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '1M':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6M':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'YTD':
      start.setMonth(0);
      start.setDate(1);
      break;
  }

  return { start, end };
}

