"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { AnalystAnswer } from "@/types/ai";
import { Badge } from "@/components/ui/badge";

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  answer?: AnalystAnswer;
};

type Props = {
  context?: { modelId?: string; range?: string; mode?: 'market' | 'macro' };
  quickPrompts?: string[];
};

export function AnalystChat({ context, quickPrompts }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'market' | 'macro'>(context?.mode ?? 'market');
  const [range, setRange] = useState<string>(context?.range ?? '1M');

  const ranges = ['1D', '1W', '1M', '3M', '1Y', '5Y'];

  const sendPrompt = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    const newMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: { ...context, mode, range },
        }),
      });

      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
      const json = await res.json();
      const answer = json.response as AnalystAnswer | undefined;
      if (!answer) throw new Error('No response returned');
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: answer.answer,
          answer,
        },
      ]);
    } catch (error) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'Unable to load answer right now. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendPrompt(input);
  const handleQuickPrompt = (prompt: string) => sendPrompt(prompt);

  return (
    <Card className="border border-white/10 bg-black/50 p-4 text-white space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'market' ? 'default' : 'outline'}
            className={
              mode === 'market'
                ? 'bg-emerald-600 text-black hover:bg-emerald-500'
                : 'border-white/20 bg-white/5 text-slate-200 hover:border-emerald-400/40'
            }
            onClick={() => setMode('market')}
            disabled={loading}
          >
            Market Brief
          </Button>
          <Button
            size="sm"
            variant={mode === 'macro' ? 'default' : 'outline'}
            className={
              mode === 'macro'
                ? 'bg-emerald-600 text-black hover:bg-emerald-500'
                : 'border-white/20 bg-white/5 text-slate-200 hover:border-emerald-400/40'
            }
            onClick={() => setMode('macro')}
            disabled={loading}
          >
            Macro IQ
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Range</span>
          {ranges.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              className={
                range === r
                  ? 'bg-emerald-600 text-black hover:bg-emerald-500'
                  : 'border-white/20 bg-white/5 text-slate-200 hover:border-emerald-400/40'
              }
              onClick={() => setRange(r)}
              disabled={loading}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
      {quickPrompts && quickPrompts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <Button
              key={prompt}
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 text-slate-200 hover:border-emerald-400/40"
              onClick={() => handleQuickPrompt(prompt)}
              disabled={loading}
            >
              {prompt}
            </Button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {messages.map((m, idx) => (
          <div key={idx} className="rounded-lg border border-white/5 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">{m.role}</div>
              {m.answer?.confidence && (
                <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-200">
                  Confidence: {m.answer.confidence}
                </Badge>
              )}
            </div>
            {m.answer ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-100">{m.answer.answer}</p>
                {m.answer.bullets?.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 text-sm text-slate-200">
                    {m.answer.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                {m.answer.nextActions?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Next actions</div>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-slate-200">
                      {m.answer.nextActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.answer.warnings && m.answer.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                    {m.answer.warnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}
                {m.answer.citedEvidence && m.answer.citedEvidence.length > 0 && (
                  <Accordion type="single" collapsible className="mt-1">
                    <AccordionItem value="evidence" className="rounded-md border border-white/5">
                      <AccordionTrigger className="px-3 text-xs text-emerald-300">
                        Show data used
                      </AccordionTrigger>
                      <AccordionContent className="space-y-1 px-3 pb-3 text-xs text-slate-200">
                        {m.answer.citedEvidence.map((e, i) => (
                          <div key={i}>
                            • {e.label}: {e.value} ({e.source})
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-100 whitespace-pre-wrap">{m.content}</p>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about models or markets"
          className="bg-black/70 border-white/10 text-white"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          onClick={handleSend}
          disabled={loading}
          className="bg-emerald-600 text-black hover:bg-emerald-500 disabled:opacity-60"
        >
          {loading ? 'Loading...' : 'Send'}
        </Button>
      </div>
    </Card>
  );
}
