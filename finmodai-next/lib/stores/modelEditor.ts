import { create } from 'zustand';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { EvaluationOutput } from '@/lib/modeling/evaluator';

export type ScenarioOverride = {
  scenarioId: string; // 'Base', 'Upside', 'Downside'
  inputKey: string;
  value: number;
};

interface ModelEditorState {
  // Artifact state
  artifact: ModelAndVizArtifact | null;
  evaluationOutput: EvaluationOutput | null;
  
  // Input overrides (base case)
  inputOverrides: Record<string, number>;
  
  // Scenario overrides
  scenarioOverrides: ScenarioOverride[];
  
  // Computed state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setArtifact: (artifact: ModelAndVizArtifact) => void;
  setEvaluationOutput: (output: EvaluationOutput | null) => void;
  updateInput: (key: string, value: number) => void;
  updateScenarioOverride: (scenarioId: string, inputKey: string, value: number) => void;
  removeScenarioOverride: (scenarioId: string, inputKey: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  artifact: null,
  evaluationOutput: null,
  inputOverrides: {},
  scenarioOverrides: [],
  isLoading: false,
  error: null,
};

export const useModelEditorStore = create<ModelEditorState>((set, get) => ({
  ...initialState,

  setArtifact: (artifact) => {
    set({
      artifact,
      inputOverrides: {},
      scenarioOverrides: [],
      error: null,
    });
  },

  setEvaluationOutput: (output) => {
    set({ evaluationOutput: output, isLoading: false, error: null });
  },

  updateInput: (key, value) => {
    const current = get().inputOverrides;
    set({
      inputOverrides: {
        ...current,
        [key]: value,
      },
      error: null,
    });
  },

  updateScenarioOverride: (scenarioId, inputKey, value) => {
    const current = get().scenarioOverrides;
    // Remove existing override for this scenario+input if any
    const filtered = current.filter(
      (o) => !(o.scenarioId === scenarioId && o.inputKey === inputKey)
    );
    
    // Add new override
    set({
      scenarioOverrides: [
        ...filtered,
        { scenarioId, inputKey, value },
      ],
      error: null,
    });
  },

  removeScenarioOverride: (scenarioId, inputKey) => {
    const current = get().scenarioOverrides;
    set({
      scenarioOverrides: current.filter(
        (o) => !(o.scenarioId === scenarioId && o.inputKey === inputKey)
      ),
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading, error: isLoading ? null : get().error });
  },

  setError: (error) => {
    set({ error, isLoading: false });
  },

  reset: () => {
    set(initialState);
  },
}));

