import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { formatAddress } from '../utils/formatAddress'
import { type TwitterUser } from '../services/twitter'
import './UserProfileDropdown.css'

/**
 * User profile dropdown component
 *
 * Displays user's Twitter profile picture, @username, and wallet address.
 * Shows a dropdown menu with Profile link and Logout button when clicked.
 *
 * @param twitterUser - Twitter user information
 * @param address - Ethereum wallet address
 */
export function UserProfileDropdown({ 
  twitterUser, 
  address 
}: { 
  twitterUser: TwitterUser
  address: string 
}) {
  const { disconnectWallet } = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  /**
   * Closes dropdown when clicking outside
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  /**
   * Handles logout - clears both wallet and Twitter tokens
   */
  async function handleLogout() {
    try {
      // Disconnect wallet
      await disconnectWallet()
      
      // Clear Twitter tokens
      localStorage.removeItem('twitterAccessToken')
      localStorage.removeItem('twitterRefreshToken')
      
      // Close dropdown
      setIsOpen(false)
      
      // Reload page to reset state
      window.location.reload()
    } catch (error) {
      console.error('Error during logout:', error)
    }
  }

  if (!twitterUser || !address) {
    return null
  }

  return (
    <div className="user-profile-dropdown" ref={dropdownRef}>
      <button
        className="user-profile-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="user-profile-info">
          {twitterUser.profile_image_url ? (
            <img
              src={twitterUser.profile_image_url}
              alt={twitterUser.name}
              className="user-profile-avatar"
            />
          ) : (
            <div className="user-profile-avatar-placeholder">
              {twitterUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="user-profile-details">
            <div className="user-profile-username">@{twitterUser.username}</div>
            <div className="user-profile-address">{formatAddress(address)}</div>
          </div>
        </div>
        <svg
          className={`user-profile-chevron ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="user-profile-menu">
          <Link to="/profile" className="user-profile-menu-item">
            Profile
          </Link>
          <button
            className="user-profile-menu-item user-profile-menu-item-logout"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

