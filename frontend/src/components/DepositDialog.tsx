import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { useEthBalance } from '../hooks/useEthBalance';
import { createCloutCardsEventsContract } from '../utils/contract';
import { getContractAddress } from '../config/contract';
import './DepositDialog.css';

/**
 * Deposit dialog component
 *
 * Allows users to deposit ETH into their escrow balance.
 * Features a slider to select deposit amount from 0 to wallet balance.
 *
 * @param isOpen - Whether the dialog is visible
 * @param onClose - Callback function called when dialog should be closed
 * @param onDepositSuccess - Callback function called when deposit is successful
 */
export function DepositDialog({
  isOpen,
  onClose,
  onDepositSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDepositSuccess?: () => void;
}) {
  const { address, provider, signature } = useWallet();
  const ethBalance = useEthBalance(address, provider);
  const [depositAmount, setDepositAmount] = useState<string>('0');
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txReceipt, setTxReceipt] = useState<ethers.TransactionReceipt | null>(null);
  const [depositEvent, setDepositEvent] = useState<{
    player: string;
    depositor: string;
    amount: bigint;
  } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const contractRef = useRef<ethers.Contract | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setDepositAmount('0');
      setError(null);
      setTxHash(null);
      setTxReceipt(null);
      setDepositEvent(null);
      setIsConfirmed(false);
    } else {
      // Clean up event listener when dialog closes
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      contractRef.current = null;
    }
  }, [isOpen]);

  // Set up contract instance when provider changes
  useEffect(() => {
    if (provider && !contractRef.current) {
      try {
        contractRef.current = createCloutCardsEventsContract(provider);
      } catch (error) {
        console.error('Failed to create contract instance:', error);
      }
    }
  }, [provider]);

  /**
   * Polls for transaction confirmation and listens for Deposited event
   */
  async function pollForConfirmation(txHash: string) {
    if (!provider || !address) {
      setError('Provider or address not available');
      setIsDepositing(false);
      return;
    }

    // Create a fresh contract instance to avoid race conditions with contractRef
    const contract = createCloutCardsEventsContract(provider);

    try {
      // Poll for transaction receipt with faster polling for local Anvil
      // Use shorter interval (500ms) for local development, 2s for L2
      const pollInterval = 500; // Faster polling for local Anvil
      let receipt: ethers.TransactionReceipt | null = null;
      const maxAttempts = 300; // More attempts with shorter interval
      let attempts = 0;

      while (!receipt && attempts < maxAttempts) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            setTxReceipt(receipt);
            setIsConfirmed(true);
            break;
          }
        } catch (err) {
          // Transaction not yet mined, continue polling
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      }

      if (!receipt) {
        setError('Transaction confirmation timeout. Please check the transaction manually.');
        setIsDepositing(false);
        return;
      }

      // Query for Deposited events from this transaction
      // Query a range of blocks to handle Anvil's fast block mining
      // Convert blockNumber to BigInt to handle both number and BigInt types
      const blockNumber = BigInt(receipt.blockNumber);
      const startBlock = blockNumber > 0n ? blockNumber - 1n : blockNumber;
      const filter = contract.filters.Deposited(null, address);
      
      // Try to query for events - may fail on some RPCs (like Base Sepolia) due to log indexing lag
      let foundEvent = null;
      try {
      const events = await contract.queryFilter(filter, startBlock, blockNumber + 1n);
        foundEvent = events.find(e => e.transactionHash === txHash) || null;
      } catch (queryError) {
        // Log indexing lag on L2 RPCs - fall through to event listener
        console.warn('Failed to query logs (RPC lag likely), falling back to event listener:', queryError);
      }

      if (foundEvent && foundEvent.args) {
        setDepositEvent({
          player: foundEvent.args[0] as string,
          depositor: foundEvent.args[1] as string,
          amount: foundEvent.args[2] as bigint,
        });
        setIsDepositing(false);
        // Call success callback
        if (onDepositSuccess) {
          onDepositSuccess();
        }
        return;
      }

      // If event not found in query or query failed, set up a listener as fallback
      // This handles cases where the event might be emitted in a future block
      let eventFound = false;
      const listener = (player: string, depositor: string, amount: bigint, eventPayload?: any) => {
        // Handle both ethers.js v6 event formats
        const eventLog = eventPayload?.log || eventPayload;
        const txHashFromEvent = eventLog?.transactionHash || (eventPayload as any)?.transactionHash;
        
        if (txHashFromEvent === txHash) {
          eventFound = true;
          setDepositEvent({
            player,
            depositor,
            amount,
          });
          setIsDepositing(false);
          // Clean up listener
          if (listenerRef.current) {
            listenerRef.current();
            listenerRef.current = null;
          }
          // Call success callback
          if (onDepositSuccess) {
            onDepositSuccess();
          }
        }
      };

      contract.on('Deposited', listener);
      listenerRef.current = () => {
        contract.off('Deposited', listener);
      };

      // Set a timeout to stop listening after 30 seconds (faster for local)
      setTimeout(() => {
        if (listenerRef.current) {
          listenerRef.current();
          listenerRef.current = null;
        }
        if (!eventFound) {
          setIsDepositing(false);
          setError('Deposit event not detected. Transaction confirmed but event may be delayed.');
        }
      }, 30000); // 30 seconds timeout
    } catch (err: unknown) {
      console.error('Error polling for confirmation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to confirm transaction';
      setError(errorMessage);
      setIsDepositing(false);
    }
  }

  /**
   * Handles deposit transaction
   */
  async function handleDeposit() {
    if (!address || !provider) {
      setError('Wallet not connected');
      return;
    }

    const contractAddr = getContractAddress();
    if (!contractAddr) {
      setError('Contract address not configured. Please set CLOUTCARDS_CONTRACT_ADDRESS environment variable.');
      return;
    }

    const amountWei = ethers.parseEther(depositAmount);
    if (amountWei === 0n) {
      setError('Deposit amount must be greater than 0');
      return;
    }

    setIsDepositing(true);
    setError(null);
    setTxHash(null);
    setTxReceipt(null);
    setDepositEvent(null);
    setIsConfirmed(false);

    try {
      const signer = await provider.getSigner();
      
      // Call the deposit() function (receive hook) by sending ETH directly
      const tx = await signer.sendTransaction({
        to: contractAddr,
        value: amountWei,
      });

      // Store transaction hash immediately
      setTxHash(tx.hash);

      // Start polling for confirmation and listening for events
      await pollForConfirmation(tx.hash);
    } catch (err: unknown) {
      console.error('Deposit error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to deposit';
      setError(errorMessage);
      setIsDepositing(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  const maxBalance = ethBalance ? parseFloat(ethBalance) : 0;
  const depositAmountNum = parseFloat(depositAmount) || 0;
  const sliderValue = maxBalance > 0 ? (depositAmountNum / maxBalance) * 100 : 0;

  return (
    <div className="deposit-dialog-overlay" onClick={onClose}>
      <div className="deposit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="deposit-dialog-header">
          <h2>Deposit ETH</h2>
          <button className="deposit-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="deposit-dialog-content">
          {!txHash && (
            <>
              <div className="deposit-balance-info">
                <div className="deposit-balance-label">Available Balance</div>
                <div className="deposit-balance-value">{ethBalance || '0.0000'} ETH</div>
              </div>

              <div className="deposit-amount-section">
                <label className="deposit-amount-label">Deposit Amount (ETH)</label>
                <div className="deposit-slider-container">
                  <input
                    type="range"
                    min="0"
                    max={maxBalance}
                    step="0.0001"
                    value={depositAmountNum}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="deposit-slider"
                    disabled={maxBalance === 0 || isDepositing}
                  />
                  <div className="deposit-slider-labels">
                    <span>0 ETH</span>
                    <span>{maxBalance.toFixed(4)} ETH</span>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max={maxBalance}
                  step="0.0001"
                  value={depositAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0 && numValue <= maxBalance) {
                      setDepositAmount(value);
                    } else if (value === '' || value === '0') {
                      setDepositAmount('0');
                    }
                  }}
                  className="deposit-amount-input"
                  disabled={isDepositing}
                />
              </div>
            </>
          )}

          {error && <div className="deposit-error">{error}</div>}

          {/* Transaction Status Section */}
          {txHash && (
            <div className="deposit-tx-status">
              <h3 className="deposit-tx-status-title">Transaction Status</h3>
              
              <div className="deposit-tx-info">
                <div className="deposit-tx-info-row">
                  <span className="deposit-tx-label">Contract Address:</span>
                  <span className="deposit-tx-value deposit-tx-address">{getContractAddress() || 'N/A'}</span>
                </div>
                
                <div className="deposit-tx-info-row">
                  <span className="deposit-tx-label">Transaction Hash:</span>
                  <span className="deposit-tx-value deposit-tx-hash">{txHash}</span>
                </div>

                {isConfirmed && (
                  <div className="deposit-tx-confirmed">
                    <span className="deposit-tx-confirmed-icon">✓</span>
                    <span>Transaction Confirmed</span>
                  </div>
                )}

                {!isConfirmed && txHash && (
                  <div className="deposit-tx-pending">
                    <span className="deposit-tx-pending-spinner">⏳</span>
                    <span>Waiting for confirmation...</span>
                  </div>
                )}

                {depositEvent && (
                  <div className="deposit-event-info">
                    <h4 className="deposit-event-title">Deposit Event</h4>
                    <div className="deposit-event-details">
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Player:</span>
                        <span className="deposit-event-value">{depositEvent.player}</span>
                      </div>
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Depositor:</span>
                        <span className="deposit-event-value">{depositEvent.depositor}</span>
                      </div>
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Amount:</span>
                        <span className="deposit-event-value deposit-event-amount">
                          {ethers.formatEther(depositEvent.amount)} ETH
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="deposit-actions">
            <button
              className="deposit-button deposit-button-cancel"
              onClick={onClose}
              disabled={isDepositing && !isConfirmed && !depositEvent}
            >
              {isConfirmed || depositEvent ? 'Close' : 'Cancel'}
            </button>
            {!isConfirmed && !depositEvent && (
              <button
                className="deposit-button deposit-button-submit"
                onClick={handleDeposit}
                disabled={depositAmountNum === 0 || maxBalance === 0 || isDepositing}
              >
                {isDepositing ? 'Depositing...' : 'Deposit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

