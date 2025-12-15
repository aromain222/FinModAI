"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Bug } from 'lucide-react';

interface DcfDebugDrawerProps {
  rawDcfOutput: any | null;
  mappedPreview: any;
}

export function DcfDebugDrawer({ rawDcfOutput, mappedPreview }: DcfDebugDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show in development (client-side check)
  // This component should only be rendered when isDevClient is true in parent,
  // but add safety check here too
  const isDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // Safety: don't render if not dev or if rawDcfOutput is null
  if (!isDev || !rawDcfOutput) {
    return null;
  }

  return (
    <Card className="border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20">
      <CardHeader>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <Bug className="h-4 w-4 text-amber-600" />
            Debug (Dev Only)
          </CardTitle>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4">
          <div>
            <h4 className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              Raw DCF Output
            </h4>
            <pre className="max-h-64 overflow-auto rounded bg-amber-100 p-2 text-xs dark:bg-amber-950/40">
              {JSON.stringify(rawDcfOutput, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              Mapped Preview Data
            </h4>
            <pre className="max-h-64 overflow-auto rounded bg-amber-100 p-2 text-xs dark:bg-amber-950/40">
              {JSON.stringify(mappedPreview, null, 2)}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
