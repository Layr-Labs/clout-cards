/**
 * React hook to fetch and manage escrow balance
 *
 * @returns Escrow balance in gwei (as string), or null if not loaded/error
 */

import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { getEscrowBalance } from '../services/escrow';

export function useEscrowBalance(): string | null {
  const { address, signature } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !signature) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const balanceGwei = await getEscrowBalance(address, signature);
        if (!cancelled) {
          setBalance(balanceGwei);
        }
      } catch (error) {
        console.error('Failed to fetch escrow balance:', error);
        if (!cancelled) {
          setBalance(null);
        }
      }
    }

    fetchBalance();

    // Refresh balance every 5 seconds
    const interval = setInterval(fetchBalance, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, signature]);

  return balance;
}

