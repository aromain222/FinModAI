'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Clock, Plus, RotateCcw, GitCompare, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { ModelVersion } from '@/lib/modeling/versioning';
import { compareVersionWithCurrent } from '@/lib/modeling/versioning';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { ComparisonPanel } from './ComparisonPanel';

type ModelVersionsDropdownProps = {
  artifactId: string;
  currentArtifact: ModelAndVizArtifact;
  onRestore?: (restoredData: { base_inputs: any[]; scenario_overrides: any; formula_overrides: any[] | null }) => void;
};

export function ModelVersionsDropdown({ artifactId, currentArtifact, onRestore }: ModelVersionsDropdownProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: versions, isLoading } = useQuery<ModelVersion[]>({
    queryKey: ['model-versions', artifactId],
    queryFn: async () => {
      const res = await fetch(`/api/model/version?artifact_id=${artifactId}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to fetch versions');
      return json.data || [];
    },
    staleTime: 30 * 1000,
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({ label, notes }: { label?: string; notes?: string }) => {
      const res = await fetch('/api/model/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, label: label || null, notes: notes || null }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to create version');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-versions', artifactId] });
      setCreateDialogOpen(false);
      setNewLabel('');
      setNewNotes('');
    },
  });

  const restoreVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch('/api/model/version/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId, artifact_id: artifactId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to restore version');
      return json.data;
    },
    onSuccess: (data) => {
      if (onRestore) {
        onRestore(data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['model-versions', artifactId] });
    },
  });

  const handleCreateVersion = () => {
    createVersionMutation.mutate({ label: newLabel || undefined, notes: newNotes || undefined });
  };

  const handleRestore = (versionId: string) => {
    if (confirm('Restore this version? Current inputs will be replaced.')) {
      restoreVersionMutation.mutate(versionId);
    }
  };

  const handleCompare = (versionId: string) => {
    setSelectedVersionId(versionId);
    setCompareDialogOpen(true);
  };

  const selectedVersion = selectedVersionId ? versions?.find((v) => v.id === selectedVersionId) : null;
  const comparison = selectedVersion ? compareVersionWithCurrent(selectedVersion, currentArtifact) : null;

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <Clock className="h-4 w-4" />
          Versions {versions && versions.length > 0 && <Badge variant="secondary">{versions.length}</Badge>}
        </Button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <Card className="absolute right-0 top-full mt-2 z-50 w-72 border-slate-700 bg-slate-900 text-slate-200 shadow-xl">
              <div className="p-3 border-b border-slate-700">
                <div className="text-sm font-semibold text-white">Model Versions</div>
              </div>
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setCreateDialogOpen(true);
                    setDropdownOpen(false);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create Version
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto border-t border-slate-700">
                {isLoading ? (
                  <div className="p-4 text-sm text-slate-400 text-center">Loading versions...</div>
                ) : versions && versions.length > 0 ? (
                  versions.map((version) => (
                    <div key={version.id} className="p-3 border-b border-slate-700/50 last:border-b-0 hover:bg-slate-800/50">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {version.label || 'Unnamed Version'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {format(new Date(version.created_at), 'MMM dd, yyyy HH:mm')}
                          </div>
                        </div>
                      </div>
                      {version.notes && (
                        <div className="text-xs text-slate-500 mb-2 line-clamp-2">{version.notes}</div>
                      )}
                      <div className="flex gap-1 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs flex-1"
                          onClick={() => {
                            handleCompare(version.id);
                            setDropdownOpen(false);
                          }}
                        >
                          <GitCompare className="mr-1 h-3 w-3" />
                          Compare
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs flex-1"
                          onClick={() => {
                            handleRestore(version.id);
                            setDropdownOpen(false);
                          }}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm text-slate-400 text-center">No versions yet</div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Create Version Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Create Model Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g., Baseline v1.0"
                className="bg-slate-800 border-slate-600"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Describe what changed in this version..."
                className="bg-slate-800 border-slate-600"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateVersion}
              disabled={createVersionMutation.isPending}
            >
              {createVersionMutation.isPending ? 'Creating...' : 'Create Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      {comparison && (
        <ComparisonPanel
          open={compareDialogOpen}
          onOpenChange={setCompareDialogOpen}
          version={selectedVersion!}
          comparison={comparison}
        />
      )}
    </>
  );
}

