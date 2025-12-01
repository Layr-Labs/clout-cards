/**
 * Formats a gwei amount (as bigint or string) for display as ETH
 *
 * Converts gwei to ETH and formats with 4 decimal places, removing trailing zeros.
 *
 * @param gwei - Gwei amount as bigint or string (e.g., 1000000000n or "1000000000")
 * @returns Formatted string (e.g., "1.0 ETH" or "0.1234 ETH")
 */
export function formatEth(gwei: bigint | string): string {
  try {
    const gweiBigInt = typeof gwei === 'string' ? BigInt(gwei) : gwei;
    const eth = Number(gweiBigInt) / 1e9;
    return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH`;
  } catch {
    return typeof gwei === 'string' ? gwei : gwei.toString();
  }
}

