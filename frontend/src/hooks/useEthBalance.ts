import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

/**
 * Custom hook for fetching and managing ETH balance
 *
 * Fetches the ETH balance for a given address and provider, and automatically
 * refreshes it at regular intervals. Returns the formatted balance string.
 *
 * @param address - Ethereum address to fetch balance for (null if not connected)
 * @param provider - Ethers.js BrowserProvider instance (null if not connected)
 * @param refreshInterval - How often to refresh balance in milliseconds (default: 10000)
 * @returns Formatted ETH balance string (e.g., "1.2345") or null if not available
 */
export function useEthBalance(
  address: string | null,
  provider: ethers.BrowserProvider | null,
  refreshInterval: number = 10000
): string | null {
  const [ethBalance, setEthBalance] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBalance() {
      if (!address || !provider) {
        setEthBalance(null)
        return
      }

      try {
        const balance = await provider.getBalance(address)
        const balanceInEth = ethers.formatEther(balance)
        // Format to 4 decimal places, remove trailing zeros
        const formatted = parseFloat(balanceInEth).toFixed(4).replace(/\.?0+$/, '')
        setEthBalance(formatted)
      } catch (error) {
        console.error('Error fetching balance:', error)
        setEthBalance(null)
      }
    }

    fetchBalance()
    
    // Refresh balance at regular intervals when connected
    if (address && provider && refreshInterval > 0) {
      const interval = setInterval(fetchBalance, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [address, provider, refreshInterval])

  return ethBalance
}

