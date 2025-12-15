'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type NotesEditorProps = {
  modelId: string;
  initialValue: string | null;
};

export function NotesEditor({ modelId, initialValue }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatus(null);
      const response = await fetch(`/api/models/${modelId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      if (!response.ok) throw new Error('Failed to save notes');
      setStatus('Saved');
    } catch (error) {
      console.error('Notes save failed', error);
      setStatus('Error saving notes');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="model-notes" className="sr-only">Model Notes</label>
      <Textarea
        id="model-notes"
        name="model-notes"
        placeholder="Capture analyst perspectives, red flags, diligence follow-ups..."
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={6}
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save notes'}
        </Button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}
