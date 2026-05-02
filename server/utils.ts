export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncates a number to a fixed number of decimal places without rounding up.
 * Uses a tiny epsilon to handle floating-point precision issues.
 */
export function truncateNumber(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  const epsilon = 1e-9;
  return value < 0 
    ? Math.ceil(value * factor - epsilon) / factor 
    : Math.floor(value * factor + epsilon) / factor;
}
