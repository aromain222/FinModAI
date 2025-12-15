"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

interface MissingBadgeProps {
  label: string;
  className?: string;
}

export function MissingBadge({ label, className }: MissingBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 ${className || ''}`}
    >
      <AlertCircle className="h-3 w-3" />
      {label}
    </Badge>
  );
}
