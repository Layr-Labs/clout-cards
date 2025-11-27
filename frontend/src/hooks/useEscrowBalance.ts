/**
 * React hook to fetch and manage escrow balance with withdrawal state
 *
 * @returns Escrow balance state including withdrawal information, or null if not loaded/error
 */

import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { getEscrowBalance, type EscrowBalanceState } from '../services/escrow';

export function useEscrowBalance(): EscrowBalanceState | null {
  const { address, signature } = useWallet();
  const [balanceState, setBalanceState] = useState<EscrowBalanceState | null>(null);

  useEffect(() => {
    if (!address || !signature) {
      setBalanceState(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const state = await getEscrowBalance(address, signature);
        if (!cancelled) {
          setBalanceState(state);
        }
      } catch (error) {
        console.error('Failed to fetch escrow balance:', error);
        if (!cancelled) {
          setBalanceState(null);
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

  return balanceState;
}

