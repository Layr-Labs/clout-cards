/**
 * Formats a gwei amount (as string) for display
 *
 * Adds commas for thousands separators for better readability.
 *
 * @param gwei - Gwei amount as string (e.g., "1000000000")
 * @returns Formatted string with commas (e.g., "1,000,000,000")
 */
export function formatGwei(gwei: string): string {
  try {
    const num = BigInt(gwei)
    return num.toLocaleString('en-US')
  } catch {
    return gwei
  }
}

