import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { createCloutCardsContractWithSigner, createCloutCardsEventsContract } from '../utils/contract';
import { signEscrowWithdrawal } from '../services/escrow';
import './CashOutDialog.css';

/**
 * Cash out dialog component
 *
 * Allows users to withdraw ETH from their escrow balance.
 * Features a slider to select withdrawal amount from 0 to escrow balance.
 *
 * @param isOpen - Whether the dialog is visible
 * @param onClose - Callback function called when dialog should be closed
 * @param onCashOutSuccess - Callback function called when withdrawal is successful
 * @param escrowBalanceGwei - Current escrow balance in gwei (as string)
 */
export function CashOutDialog({
  isOpen,
  onClose,
  onCashOutSuccess,
  escrowBalanceGwei,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCashOutSuccess?: () => void;
  escrowBalanceGwei: string;
}) {
  const { address, provider, signature } = useWallet();
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('0');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txReceipt, setTxReceipt] = useState<ethers.TransactionReceipt | null>(null);
  const [withdrawalEvent, setWithdrawalEvent] = useState<{
    player: string;
    to: string;
    amount: bigint;
    nonce: bigint;
  } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const contractRef = useRef<ethers.Contract | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  // Convert escrow balance from gwei to ETH
  const maxBalanceEth = escrowBalanceGwei ? Number(escrowBalanceGwei) / 1e9 : 0;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setWithdrawAmount('0');
      setError(null);
      setTxHash(null);
      setTxReceipt(null);
      setWithdrawalEvent(null);
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

  // Set up contract instance when provider changes (for event listening)
  useEffect(() => {
    if (provider && !contractRef.current) {
      try {
        const contract = createCloutCardsEventsContract(provider);
        contractRef.current = contract;
        setContractAddress(contract.target as string);
      } catch (error) {
        console.error('Failed to create contract instance:', error);
      }
    }
  }, [provider]);

  /**
   * Polls for transaction confirmation and listens for WithdrawalExecuted event
   */
  async function pollForConfirmation(txHash: string) {
    if (!provider) {
      throw new Error('Provider not available');
    }

    // Set up event listener for WithdrawalExecuted
    // Create a fresh contract instance for event listening
    const contract = createCloutCardsEventsContract(provider);
    
    // Match the backend pattern: (player, to, amount, nonce, eventPayload)
    // Also handle DepositDialog pattern: (player, to, amount, nonce, event: ethers.Log)
    const eventHandler = (player: string, to: string, amount: bigint, nonce: bigint, eventPayload?: any) => {
      // Only process events for this transaction
      if (eventPayload?.log?.transactionHash !== txHash && eventPayload?.transactionHash !== txHash) {
        return;
      }
      
      // Validate amount is not null/undefined before setting
      if (amount === null || amount === undefined) {
        console.error('WithdrawalExecuted event has null/undefined amount:', { player, to, amount, nonce });
        return;
      }
      
      console.log('WithdrawalExecuted event detected:', { player, to, amount, nonce });
      setWithdrawalEvent({ player, to, amount, nonce });
      
      // Clean up listener once we have the event
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      
      // Call success callback
      if (onCashOutSuccess) {
        onCashOutSuccess();
      }
    };

    contract.on('WithdrawalExecuted', eventHandler);
    listenerRef.current = () => {
      contract.off('WithdrawalExecuted', eventHandler);
    };

    // Poll for confirmation (every 2 seconds for L2 networks)
    const maxAttempts = 150; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          setTxReceipt(receipt);
          setIsConfirmed(true);
          console.log('Transaction confirmed:', receipt);
          return;
        }
      } catch (error) {
        console.error('Error polling for confirmation:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Handles the withdrawal submission
   */
  async function handleCashOut() {
    if (!address) {
      setError('Wallet address not available. Please connect your wallet.');
      return;
    }
    if (!signature) {
      setError('Wallet signature not available. Please sign in with your wallet.');
      return;
    }
    if (!provider) {
      setError('Wallet provider not available. Please connect your wallet.');
      return;
    }

    const withdrawAmountNum = parseFloat(withdrawAmount);
    if (withdrawAmountNum <= 0 || withdrawAmountNum > maxBalanceEth) {
      setError('Invalid withdrawal amount');
      return;
    }

    setIsWithdrawing(true);
    setError(null);

    try {
      // Convert withdrawal amount from ETH to gwei
      const withdrawAmountGwei = BigInt(Math.floor(withdrawAmountNum * 1e9));

      // Sign withdrawal request with backend
      console.log('Signing withdrawal request...');
      const withdrawalSignature = await signEscrowWithdrawal(
        address,
        signature,
        withdrawAmountGwei.toString(),
        address // toAddress must match walletAddress
      );

      console.log('Withdrawal signature received:', withdrawalSignature);

      // Convert amount from ETH to wei for contract call
      const withdrawAmountWei = ethers.parseEther(withdrawAmount);

      // Ensure we have a fresh contract instance with signer
      if (!provider) {
        throw new Error('Provider not available');
      }
      const signer = await provider.getSigner();
      const contract = createCloutCardsContractWithSigner(signer);
      
      // Get contract address for balance check
      const contractAddr = contract.target as string;
      if (!contractAddr) {
        throw new Error('Contract address not available');
      }
      
      // Store contract address for display
      if (!contractAddress) {
        setContractAddress(contractAddr);
      }

      // Check contract balance before attempting withdrawal
      const contractBalance = await provider.getBalance(contractAddr);
      if (contractBalance < withdrawAmountWei) {
        throw new Error(
          `Contract has insufficient balance. Contract balance: ${ethers.formatEther(contractBalance)} ETH, ` +
          `Requested: ${ethers.formatEther(withdrawAmountWei)} ETH. ` +
          `This may indicate deposits were sent to a different contract address.`
        );
      }

      // Call withdraw function on contract
      const tx = await contract.withdraw(
        address, // player
        address, // to
        withdrawAmountWei, // amount
        withdrawalSignature.nonce, // nonce
        withdrawalSignature.expiry, // expiry
        withdrawalSignature.v, // v
        withdrawalSignature.r, // r
        withdrawalSignature.s // s
      );

      console.log('Withdrawal transaction submitted:', tx.hash);
      setTxHash(tx.hash);

      // Poll for confirmation
      await pollForConfirmation(tx.hash);

      // Call success callback
      if (onCashOutSuccess) {
        onCashOutSuccess();
      }
    } catch (error: any) {
      console.error('Error processing withdrawal:', error);
      setError(error.message || 'Failed to process withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  }

  // Format amount for display
  const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
  const withdrawAmountDisplay = withdrawAmountNum.toFixed(6).replace(/\.?0+$/, '');

  return (
    <>
      {isOpen && (
        <div className="dialog-overlay-base cash-out-dialog-overlay" onClick={onClose}>
          <div className="dialog-content-base cash-out-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header-base cash-out-dialog-header">
              <h2 className="dialog-title-base">Cash Out</h2>
              <button className="dialog-close-base cash-out-dialog-close" onClick={onClose}>
                ×
              </button>
            </div>

            <div className="dialog-content-area-base cash-out-dialog-content">
              {!txHash && (
                <>
                  <div className="cash-out-balance-info">
                    <div className="cash-out-balance-label">Escrow Balance</div>
                    <div className="cash-out-balance-value">{maxBalanceEth.toFixed(6).replace(/\.?0+$/, '')} ETH</div>
                  </div>

                  <div className="cash-out-amount-section">
                    <label className="cash-out-amount-label">
                      Withdrawal Amount: {withdrawAmountDisplay} ETH
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={maxBalanceEth}
                      step={0.000001}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="cash-out-slider"
                      disabled={isWithdrawing || maxBalanceEth === 0}
                    />
                    <input
                      type="number"
                      min="0"
                      max={maxBalanceEth}
                      step={0.000001}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="cash-out-input"
                      disabled={isWithdrawing || maxBalanceEth === 0}
                    />
                  </div>
                </>
              )}

              {error && <div className="cash-out-error">{error}</div>}

              {txHash && (
                <div className="cash-out-tx-status">
                  <h3 className="cash-out-tx-status-title">Transaction Status</h3>
                  <div className="cash-out-tx-info">
                    <div className="cash-out-tx-info-row">
                      <span className="cash-out-tx-info-label">Contract:</span>
                      <span className="cash-out-tx-info-value">{contractAddress || 'N/A'}</span>
                    </div>
                    <div className="cash-out-tx-info-row">
                      <span className="cash-out-tx-info-label">Transaction Hash:</span>
                      <a
                        href={`https://etherscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cash-out-tx-link"
                      >
                        {txHash}
                      </a>
                    </div>
                    <div className="cash-out-tx-info-row">
                      <span className="cash-out-tx-info-label">Status:</span>
                      <span className={`cash-out-tx-status-badge ${isConfirmed ? 'confirmed' : 'pending'}`}>
                        {isConfirmed ? 'Confirmed' : 'Pending...'}
                      </span>
                    </div>
                    {withdrawalEvent && (
                      <div className="cash-out-tx-event">
                        <h4>Withdrawal Executed</h4>
                        <div className="cash-out-tx-info-row">
                          <span className="cash-out-tx-info-label">Player:</span>
                          <span className="cash-out-tx-info-value">{withdrawalEvent.player}</span>
                        </div>
                        <div className="cash-out-tx-info-row">
                          <span className="cash-out-tx-info-label">To:</span>
                          <span className="cash-out-tx-info-value">{withdrawalEvent.to}</span>
                        </div>
                        <div className="cash-out-tx-info-row">
                          <span className="cash-out-tx-info-label">Amount:</span>
                          <span className="cash-out-tx-info-value">
                            {withdrawalEvent.amount !== null && withdrawalEvent.amount !== undefined
                              ? `${ethers.formatEther(withdrawalEvent.amount)} ETH`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="cash-out-tx-info-row">
                          <span className="cash-out-tx-info-label">Nonce:</span>
                          <span className="cash-out-tx-info-value">{withdrawalEvent.nonce.toString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="cash-out-actions">
                <button
                  className="cash-out-button cash-out-button-cancel"
                  onClick={onClose}
                  disabled={isWithdrawing && !isConfirmed && !withdrawalEvent}
                >
                  {isConfirmed || withdrawalEvent ? 'Close' : 'Cancel'}
                </button>
                {!isConfirmed && !withdrawalEvent && (
                  <button
                    className="cash-out-button cash-out-button-submit"
                    onClick={handleCashOut}
                    disabled={withdrawAmountNum === 0 || maxBalanceEth === 0 || isWithdrawing}
                  >
                    {isWithdrawing ? 'Processing...' : 'Cash Out'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

