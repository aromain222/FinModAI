export type AnalystAnswer = {
  answer: string; // 3–7 sentences max
  bullets: string[]; // 3–8 bullets
  citedEvidence: { label: string; value: string; source: string }[]; // exact tool path references
  confidence: 'high' | 'medium' | 'low';
  nextActions: string[]; // 2–5 items
  warnings?: string[];
};

export type AiToolResult = {
  name: string;
  data?: any;
  error?: string;
  unavailable?: boolean;
  meta?: Record<string, any>;
};

export type ChatRunLog = {
  user_id: string | null;
  messages: any;
  tool_context: any;
};
