type KeyResults = {
  enterpriseValue: number | null;
  equityValue: number | null;
  pricePerShare: number | null;
  wacc: number | null;
  terminalGrowth: number | null;
  revenueCagr: number | null;
  ebitMargin: number | null;
};

type DriverInsight = { label: string; detail: string };

export function deriveDrivers(keyResults: KeyResults): { drivers: DriverInsight[]; risks: DriverInsight[] } {
  const drivers: DriverInsight[] = [];
  const risks: DriverInsight[] = [];

  if (keyResults.pricePerShare !== null && keyResults.wacc !== null) {
    drivers.push({
      label: 'WACC sensitivity',
      detail: `Price per share at ${keyResults.pricePerShare.toFixed(2)} with WACC ${keyResults.wacc}% suggests discount rate heavily influences terminal value.`,
    });
  }

  if (keyResults.revenueCagr !== null) {
    drivers.push({
      label: 'Growth trajectory',
      detail: `Revenue CAGR modeled at ${keyResults.revenueCagr}% drives top-line expansion.`,
    });
    if (keyResults.revenueCagr > 12) {
      risks.push({
        label: 'Aggressive revenue CAGR',
        detail: `CAGR ${keyResults.revenueCagr}% may be aggressive for a mature name; consider stress testing lower growth.`,
      });
    }
  }

  if (keyResults.ebitMargin !== null) {
    drivers.push({
      label: 'Margin profile',
      detail: `EBIT margin set at ${keyResults.ebitMargin}% underpins profitability assumptions.`,
    });
    if (keyResults.ebitMargin > 35) {
      risks.push({
        label: 'High margin assumption',
        detail: `EBIT margin ${keyResults.ebitMargin}% could be optimistic; benchmark peers for realism.`,
      });
    }
  }

  if (keyResults.terminalGrowth !== null) {
    drivers.push({
      label: 'Terminal growth',
      detail: `Terminal growth of ${keyResults.terminalGrowth}% influences terminal value weight.`,
    });
    if (keyResults.terminalGrowth > 3) {
      risks.push({
        label: 'Terminal growth risk',
        detail: `Terminal growth ${keyResults.terminalGrowth}% exceeds typical GDP-like rates; may overstate TV.`,
      });
    }
  }

  if (drivers.length === 0) {
    drivers.push({ label: 'Insufficient data', detail: 'Key results not available; cannot derive drivers.' });
  }
  if (risks.length === 0) {
    risks.push({ label: 'No explicit risks flagged', detail: 'Assumptions within typical bounds based on available fields.' });
  }

  return { drivers: drivers.slice(0, 6), risks: risks.slice(0, 4) };
}
