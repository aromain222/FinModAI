/**
 * CapitalBase Financial Math Engine
 * Main Entry Point
 * 
 * Provides deterministic derivation of missing financial datapoints
 * using only provable accounting identities and defensible math
 */

// Types
export type {
  FinancialKey,
  FinancialValue,
  FinancialState,
  ResolvedState,
  ProvenanceStatus,
  ConfidenceLevel,
  DerivationRule,
  ModelRequirements,
} from './types';

// Solver
export {
  resolve,
  getProvenance,
  getKeysByStatus,
  formatResolvedState,
} from './solver';

// Rules
export {
  DERIVATION_RULES,
  getRulesForOutput,
  getRulesByCategory,
} from './rules';

// Finance Math
export {
  discountFactor,
  discountFactorDays,
  npv,
  xnpv,
  irr,
  xirr,
} from './financeMath';

// Model Requirements
export {
  COMPS_REQUIREMENTS,
  DCF_REQUIREMENTS,
  THREE_STATEMENT_REQUIREMENTS,
  LBO_REQUIREMENTS,
  MERGER_REQUIREMENTS,
  getModelRequirements,
  getMissingRequiredKeys,
  getMissingAssumptionKeys,
} from './modelRequirements';

// Missing Data Map
export {
  MISSING_DATA_MAP,
  getMissingDataPoint,
  getMissingDataPointsByCategory,
  getDerivableKeys,
  getNonDerivableKeys,
} from './missingDataMap';
export type {
  DerivationCategory,
  MissingDataPoint,
} from './missingDataMap';

// Model Modes
export {
  COMPS_MODES,
  DCF_MODES,
  THREE_STATEMENT_MODES,
  LBO_MODES,
  MERGER_MODES,
  getModelModeRequirements,
  canRunMVP,
  canRunFull,
} from './modelModes';
export type {
  OutputMode,
  ModelModeRequirements,
} from './modelModes';

// User Prompts
export {
  generatePromptPlan,
  generateWACCPrompt,
} from './userPrompts';
export type {
  PromptPlan,
  PromptField,
  UnitPreference,
} from './userPrompts';

// QC Tests
export {
  QC_TEST_CASES,
  runQCTest,
  runAllQCTests,
} from './qc.test';
export type {
  QCTestCase,
} from './qc.test';

// Suppression Rules
export {
  SUPPRESSION_RULES,
  shouldSuppress,
  getSuppressedOutputs,
  getSuppressionNote,
} from './SUPPRESSION_RULES';
export type {
  SuppressionRule,
} from './SUPPRESSION_RULES';
