import type { Signal } from '@/lib/ranking/types';

export type PitchVoteStatus = 'pending' | 'approved' | 'rejected';

export type PitchQueueItem = {
  id: string;
  ticker: string;
  opportunityScore: number;
  signal: Signal | string;
  horizon: string;
  primaryReason: string;
  mainRisk: string;
  generatedPitch: string;
  timestamp: number;
  voteStatus: PitchVoteStatus;
};

