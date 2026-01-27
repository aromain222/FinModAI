'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, HelpCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AgentOutputSchema, type AgentInput, type AgentOutput } from '@/lib/ai/schemas';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

type AnswerMap = Record<string, string>;

const normalizeAnswers = (answers: AnswerMap): AnswerMap => {
  const out: AnswerMap = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    const key = typeof k === 'string' ? k.trim() : '';
    const val = typeof v === 'string' ? v.trim() : '';
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
};

export function ClarifyingWorkflow(props: {
  output: AgentOutput;
  originalPrompt: string;
  context?: AgentInput['context'];
  onResolved: (next: AgentOutput) => void;
}) {
  const questions = useMemo(
    () => (Array.isArray(props.output.clarifying_questions) ? props.output.clarifying_questions.filter((q) => typeof q === 'string' && q.trim()) : []),
    [props.output.clarifying_questions]
  );

  const [selectedQuestion, setSelectedQuestion] = useState<string>('');
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!selectedQuestion && questions.length) setSelectedQuestion(questions[0]);
    if (selectedQuestion && questions.length && !questions.includes(selectedQuestion)) setSelectedQuestion(questions[0]);
  }, [questions, selectedQuestion]);

  const answeredCount = useMemo(() => Object.keys(normalizeAnswers(answers)).length, [answers]);

  const onSubmitAnswers = async () => {
    const prompt = props.originalPrompt?.trim();
    if (!prompt) {
      setError('Original prompt missing.');
      return;
    }

    const followup_answers = normalizeAnswers(answers);
    if (!Object.keys(followup_answers).length) {
      setError('Add at least one answer to continue.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const body: AgentInput = {
        prompt,
        context: props.context,
        followup_answers,
      };

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(safeText(json?.message) || 'Request failed.');
        return;
      }

      const parsed = AgentOutputSchema.safeParse(json);
      if (!parsed.success) {
        setError('Agent returned invalid output.');
        return;
      }

      props.onResolved(parsed.data);
    } catch (e) {
      setError(safeText(e) || 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!questions.length) return null;

  return (
    <Card className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200">
            <HelpCircle className="h-4 w-4" />
            Clarifying questions
          </div>
          <div className="mt-1 text-xs text-amber-100/80">
            Answer the questions below to generate a higher-confidence artifact. Answers are saved with your artifact history.
          </div>
        </div>
        <div className="text-[11px] text-amber-100/70 whitespace-nowrap">{answeredCount}/{questions.length} answered</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {questions.map((q) => {
          const isSelected = selectedQuestion === q;
          const isAnswered = Boolean(answers[q]?.trim());
          return (
            <button
              key={q}
              type="button"
              onClick={() => setSelectedQuestion(q)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors',
                isSelected ? 'border-amber-300/40 bg-amber-300/10 text-amber-100' : 'border-amber-500/20 bg-black/10 text-amber-100/80 hover:bg-black/20',
                isAnswered ? 'ring-1 ring-emerald-400/20' : ''
              )}
              title={q}
            >
              {isAnswered ? <Check className="h-3 w-3 text-emerald-300" /> : null}
              <span className="max-w-[320px] truncate">{q}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <Textarea
          value={selectedQuestion ? answers[selectedQuestion] ?? '' : ''}
          onChange={(e) => {
            const value = e.target.value;
            setAnswers((prev) => ({ ...prev, ...(selectedQuestion ? { [selectedQuestion]: value } : {}) }));
          }}
          placeholder={selectedQuestion ? `Answer: ${selectedQuestion}` : 'Select a question to answer'}
          className="min-h-[90px] border-amber-500/20 bg-black/20 text-amber-50 placeholder:text-amber-100/40"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {error ? <div className="text-xs text-rose-200">{error}</div> : <div className="text-xs text-amber-100/60">Tip: answer at least 1–2 questions to proceed.</div>}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnswers({})}
              disabled={submitting || !answeredCount}
              className="text-amber-100/80 hover:text-amber-100"
            >
              Reset
            </Button>
            <Button size="sm" onClick={onSubmitAnswers} disabled={submitting}>
              {submitting ? 'Generating…' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
