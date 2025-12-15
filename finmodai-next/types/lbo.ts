export interface LboAdvancedOptions {
  /** Percentage of fully diluted equity that management rolls over (0-1). */
  managementRolloverPct?: number;
  /** Preferred equity funding amount in millions. */
  preferredEquityAmount?: number;
  /** Subordinated notes funding amount in millions. */
  subordinatedNotesAmount?: number;
  /** Minimum cash required at close in millions. */
  minimumCashAtClose?: number;
}

