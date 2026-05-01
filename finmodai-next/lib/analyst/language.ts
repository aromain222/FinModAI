export function formatValuationConclusion({
  percentGap,
  isHighlySensitive,
}: {
  percentGap: number;
  isHighlySensitive: boolean;
}): string {
  const abs = Math.abs(percentGap);
  const dir = percentGap > 0 ? 'undervalued' : 'overvalued';

  if (abs < 5) return 'Trading near intrinsic value estimates';

  if (isHighlySensitive) {
    if (abs < 20) return `Modestly ${dir} under base assumptions`;
    if (abs < 40) return `Appears ${dir} — sensitive to terminal growth assumptions`;
    return `Appears significantly ${dir} under current assumptions — interpret with caution`;
  }

  if (abs < 20) return `Modestly ${dir} on current assumptions`;
  if (abs < 40) return `${dir.charAt(0).toUpperCase()}${dir.slice(1)} across most assumption sets`;
  return `Significantly ${dir} on current assumptions`;
}
