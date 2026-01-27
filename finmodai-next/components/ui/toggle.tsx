'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed, onPressedChange, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-pressed={pressed}
        data-state={pressed ? 'on' : 'off'}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          pressed
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-black/40 text-slate-400 border border-white/10 hover:bg-black/60 hover:text-white',
          className
        )}
        onClick={() => onPressedChange?.(!pressed)}
        {...props}
      />
    );
  }
);
Toggle.displayName = 'Toggle';

export { Toggle };

