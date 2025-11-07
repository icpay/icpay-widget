export function formatTokenAmountThirdwebStyle(value: string | number): string {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  // Threshold at 1e-5 → show compact lower-than indicator
  if (abs < 1e-5) return '< 0.00001';
  // Truncate (not round) to 5 decimal places, then trim trailing zeros
  const factor = 1e5;
  const truncated = Math.trunc(n * factor) / factor;
  const fixed = truncated.toFixed(5);
  return fixed.replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}


