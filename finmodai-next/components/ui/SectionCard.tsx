import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  titleSize?: 'lg' | 'xl' | '2xl';
}

const SectionCard = React.forwardRef<HTMLDivElement, SectionCardProps>(
  ({ title, subtitle, headerRight, children, titleSize = 'lg', className, ...props }, ref) => {
    const titleClass = {
      'lg': 'text-lg font-semibold text-white',
      'xl': 'text-xl font-semibold text-white',
      '2xl': 'text-2xl font-semibold text-white',
    }[titleSize];

    return (
      <div
        ref={ref}
        className={cn(
          'bg-slate-950/60 border border-white/5 backdrop-blur-sm rounded-2xl p-6',
          className
        )}
        {...props}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={cn(titleClass)}>{title}</h3>
            {subtitle && (
              <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
            )}
          </div>
          {headerRight && (
            <div className="flex items-center gap-2">
              {headerRight}
            </div>
          )}
        </div>
        {children}
      </div>
    );
  }
);
SectionCard.displayName = 'SectionCard';

export { SectionCard };

