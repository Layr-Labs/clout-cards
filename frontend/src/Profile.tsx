import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SiX } from 'react-icons/si';
import { useWallet } from './contexts/WalletContext';
import { useTwitterUser } from './hooks/useTwitterUser';
import { useEthBalance } from './hooks/useEthBalance';
import { useEscrowBalance } from './hooks/useEscrowBalance';
import { formatAddress } from './utils/formatAddress';
import { DepositDialog } from './components/DepositDialog';
import { UserProfileDropdown } from './components/UserProfileDropdown';
import { WalletAvatar } from './components/WalletAvatar';
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
  const escrowBalanceGwei = useEscrowBalance();
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);

  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address;

  // Convert gwei to ETH for display
  // gwei is already in gwei (10^9 wei), so divide by 10^9 to get ETH
  const escrowBalanceEth = escrowBalanceGwei
    ? (Number(escrowBalanceGwei) / 1e9).toFixed(6).replace(/\.?0+$/, '')
    : '0.0000';

  const twitterUrl = twitterUser ? `https://twitter.com/${twitterUser.username}` : '';

  return (
    <div className="app">
      {/* Header - same as /play */}
      <header className="header">
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/play" className="nav-link">Tables</Link>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          {isFullyLoggedIn && twitterUser && address ? (
            <UserProfileDropdown twitterUser={twitterUser} address={address} />
          ) : (
            <button
              className="header-login-button"
              onClick={() => {
                // Redirect to play page to login
                window.location.href = '/play';
              }}
            >
              Log In
            </button>
          )}
        </nav>
      </header>

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
                <button
                  className="profile-deposit-button"
                  onClick={() => setIsDepositDialogOpen(true)}
                >
                  Deposit
                </button>
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
    </div>
  );
}

