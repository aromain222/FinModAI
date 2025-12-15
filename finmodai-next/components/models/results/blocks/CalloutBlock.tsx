"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';

export interface CalloutBlockProps {
  tone: 'warning' | 'info';
  title: string;
  bullets: string[];
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
}

/**
 * Callout Block - Warning or info callout with bullets and optional CTA
 * 
 * Used when some blocks can't compute but model was generated.
 * Never shows empty tables.
 */
export function CalloutBlock({
  tone,
  title,
  bullets,
  ctaLabel,
  ctaHref,
  onCtaClick,
  className = '',
}: CalloutBlockProps) {
  const isWarning = tone === 'warning';
  const Icon = isWarning ? AlertTriangle : Info;

  return (
    <Card
      className={`border ${
        isWarning
          ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20'
      } ${className}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon
            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
              isWarning
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-blue-600 dark:text-blue-400'
            }`}
          />
          <div className="flex-1">
            <h3
              className={`text-sm font-semibold mb-2 ${
                isWarning
                  ? 'text-amber-900 dark:text-amber-200'
                  : 'text-blue-900 dark:text-blue-200'
              }`}
            >
              {title}
            </h3>
            <ul className="space-y-1 text-sm mb-3">
              {bullets.map((bullet, idx) => (
                <li
                  key={idx}
                  className={`flex items-start gap-2 ${
                    isWarning
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-blue-800 dark:text-blue-300'
                  }`}
                >
                  <span className="mt-0.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {(ctaLabel && (ctaHref || onCtaClick)) && (
              <Button
                onClick={onCtaClick}
                href={ctaHref}
                size="sm"
                variant="outline"
                className={
                  isWarning
                    ? 'border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/40'
                    : 'border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/40'
                }
              >
                {ctaLabel}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
