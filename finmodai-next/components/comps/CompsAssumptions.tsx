"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { CompsOutput } from '@/lib/models/outputTypes';

interface CompsAssumptionsProps {
  output: CompsOutput;
  targetTicker: string;
}

const DETERMINISTIC_ASSUMPTIONS = [
  'Peers selected based on sector and revenue model similarity',
  'Financials are LTM (Last Twelve Months) unless otherwise stated',
  'Negative earnings companies excluded from P/E analysis',
  'Multiples reflect current market conditions',
];

export function CompsAssumptions({ output, targetTicker }: CompsAssumptionsProps) {
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <Accordion type="single" collapsible defaultValue={undefined} className="w-full">
        <AccordionItem value="assumptions" className="border-0">
          <CardHeader className="pb-2">
            <AccordionTrigger className="hover:no-underline py-2">
              <CardTitle className="text-base font-medium text-[var(--cb-text-primary)]">
                Peer Group Assumptions
              </CardTitle>
            </AccordionTrigger>
          </CardHeader>
          <AccordionContent>
            <CardContent className="pt-0 pb-4 space-y-4">
              {/* Deterministic Assumptions */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--cb-text-primary)] uppercase tracking-wide mb-3">
                  Selection Criteria
                </h4>
                <ul className="space-y-2">
                  {DETERMINISTIC_ASSUMPTIONS.map((assumption, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-[var(--cb-text-primary)]">
                      <span className="text-[var(--cb-text-muted)] mt-0.5">•</span>
                      <span>{assumption}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Peer Count Summary (optional deterministic info) */}
              {(output.peers ?? []).length > 0 && (
                <div className="pt-2 border-t border-[var(--cb-border-subtle)]">
                  <p className="text-xs text-[var(--cb-text-muted)]">
                    Analysis based on {(output.peers ?? []).length} peer{(output.peers ?? []).length !== 1 ? 's' : ''} selected for{' '}
                    {targetTicker}.
                  </p>
                </div>
              )}
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

