/**
 * Contract configuration for frontend
 *
 * Reads contract address from environment variable.
 * Vite will expose CLOUTCARDS_CONTRACT_ADDRESS via vite.config.ts define.
 */

/**
 * Gets the CloutCards contract address
 *
 * Reads from import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS which is mapped
 * from the CLOUTCARDS_CONTRACT_ADDRESS environment variable via Vite config.
 *
 * @returns Contract address or undefined if not set
 */
export function getContractAddress(): string | undefined {
  return import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS as string | undefined;
}

