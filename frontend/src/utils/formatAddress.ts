/**
 * Formats an Ethereum address for display
 *
 * Shows the first 6 characters and last 4 characters of the address,
 * with ellipsis in between: 0x1234...5678
 *
 * @param address - Full Ethereum address (0x...)
 * @returns Formatted address string
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

