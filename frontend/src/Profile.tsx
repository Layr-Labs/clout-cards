import { useState } from 'react';
import { SiX } from 'react-icons/si';
import { useWallet } from './contexts/WalletContext';
import { useTwitterUser } from './hooks/useTwitterUser';
import { useEthBalance } from './hooks/useEthBalance';
import { useEscrowBalance } from './hooks/useEscrowBalance';
import { formatAddress } from './utils/formatAddress';
import { DepositDialog } from './components/DepositDialog';
import { CashOutDialog } from './components/CashOutDialog';
import { PageLayout } from './components/PageLayout';
import { WalletAvatar } from './components/WalletAvatar';
import { Tooltip } from './components/Tooltip';
import './Profile.css';
import './App.css';

/**
 * Profile page component
 *
 * Displays user profile information including:
 * - Twitter avatar and name with link to Twitter
 * - Connected wallet address and balance
 * - Casino escrow balance with deposit button
 */
export default function Profile() {
  const { address, provider, isLoggedIn } = useWallet();
  const twitterUser = useTwitterUser();
  const ethBalance = useEthBalance(address, provider);
  const escrowBalanceState = useEscrowBalance();
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  const [isCashOutDialogOpen, setIsCashOutDialogOpen] = useState(false);

  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address;

  // Convert gwei to ETH for display
  // gwei is already in gwei (10^9 wei), so divide by 10^9 to get ETH
  const escrowBalanceGwei = escrowBalanceState?.balanceGwei || '0';
  const escrowBalanceEth = escrowBalanceGwei
    ? (Number(escrowBalanceGwei) / 1e9).toFixed(6).replace(/\.?0+$/, '')
    : '0.0000';
  
  // withdrawalPending is false if escrowBalanceState is null (not loaded yet)
  const withdrawalPending = escrowBalanceState?.withdrawalPending ?? false;
  const withdrawalExpiry = escrowBalanceState?.withdrawalSignatureExpiry;

  // Format expiry time for tooltip
  const formatExpiryTooltip = (expiry: string | null): string => {
    if (!expiry) return '';
    try {
      const expiryDate = new Date(expiry);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        return 'Withdrawal signature has expired';
      }
      
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      
      if (diffHours > 0) {
        const remainingMinutes = diffMinutes % 60;
        return `Withdrawal expires in ${diffHours} hour${diffHours > 1 ? 's' : ''}${remainingMinutes > 0 ? ` and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : ''}`;
      } else if (diffMinutes > 0) {
        const remainingSeconds = diffSeconds % 60;
        return `Withdrawal expires in ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}${remainingSeconds > 0 ? ` and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`;
      } else {
        return `Withdrawal expires in ${diffSeconds} second${diffSeconds > 1 ? 's' : ''}`;
      }
    } catch (error) {
      return 'Withdrawal pending';
    }
  };

  const twitterUrl = twitterUser ? `https://twitter.com/${twitterUser.username}` : '';

  return (
    <PageLayout>
      <div className="profile-container">
        {!isFullyLoggedIn || !twitterUser || !address ? (
          <div className="profile-content">
            <div className="profile-error">
              Please log in to view your profile.
            </div>
          </div>
        ) : (
          <div className="profile-content">
            {/* X Profile Section */}
            <div className="profile-section">
              <div className="profile-section-header">
                <h2>
                  <SiX size={24} />
                  Profile
                </h2>
              </div>
              <div className="profile-twitter-content">
                {twitterUser.profile_image_url ? (
                  <img
                    src={twitterUser.profile_image_url}
                    alt={twitterUser.name}
                    className="profile-twitter-avatar"
                  />
                ) : (
                  <div className="profile-twitter-avatar-placeholder">
                    {twitterUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="profile-twitter-details">
                  <a
                    href={twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profile-twitter-username"
                  >
                    @{twitterUser.username}
                  </a>
                </div>
              </div>
            </div>

            {/* Wallet Section */}
            <div className="profile-section">
              <div className="profile-section-header">
                <h2>Wallet</h2>
              </div>
              <div className="profile-wallet-content">
                <div className="profile-wallet-address-row">
                  <WalletAvatar address={address} size={40} />
                  <div className="profile-wallet-address-value">
                    {formatAddress(address)}
                  </div>
                </div>
                <div className="profile-wallet-balance-row">
                  <div className="profile-wallet-balance-label">Balance</div>
                  <div className="profile-wallet-balance-value">
                    {ethBalance || '0.0000'} ETH
                  </div>
                </div>
                <div className="profile-escrow-balance-row">
                  <div className="profile-escrow-balance-label">Escrow</div>
                  <div className="profile-escrow-balance-value">
                    {escrowBalanceEth} ETH
                  </div>
                </div>
                <div className="profile-escrow-actions">
                  <button
                    className="profile-deposit-button"
                    onClick={() => setIsDepositDialogOpen(true)}
                    disabled={withdrawalPending}
                    title={withdrawalPending ? 'A withdrawal is pending. Please wait for it to complete.' : ''}
                  >
                    Deposit
                  </button>
                  {withdrawalPending ? (
                    <Tooltip content={formatExpiryTooltip(withdrawalExpiry || null)} position="top">
                      <button
                        className="profile-cash-out-button profile-withdrawal-pending-button"
                        disabled={true}
                      >
                        Withdrawal Pending
                      </button>
                    </Tooltip>
                  ) : (
                    <button
                      className="profile-cash-out-button"
                      onClick={() => setIsCashOutDialogOpen(true)}
                      disabled={!escrowBalanceState || escrowBalanceEth === '0.0000' || Number(escrowBalanceEth) === 0}
                    >
                      CASH OUT
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <DepositDialog
        isOpen={isDepositDialogOpen}
        onClose={() => setIsDepositDialogOpen(false)}
        onDepositSuccess={() => {
          // Balance will auto-refresh via useEscrowBalance hook
          console.log('Deposit successful');
        }}
      />

      <CashOutDialog
        isOpen={isCashOutDialogOpen}
        onClose={() => setIsCashOutDialogOpen(false)}
        onCashOutSuccess={() => {
          // Balance will auto-refresh via useEscrowBalance hook
          console.log('Cash out successful');
        }}
        escrowBalanceGwei={escrowBalanceGwei}
      />
    </PageLayout>
  );
}

