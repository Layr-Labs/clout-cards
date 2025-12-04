import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBars, FaTimes } from 'react-icons/fa'
import { UserProfileDropdown } from './UserProfileDropdown'
import { useTwitterUser } from '../hooks/useTwitterUser'
import { useWallet } from '../contexts/WalletContext'
import './Header.css'

/**
 * Props for the Header component
 */
interface HeaderProps {
  /**
   * Optional login dialog open handler
   * If provided, clicking "Log In" will call this function
   */
  onLoginClick?: () => void

  /**
   * Optional custom navigation links
   * If not provided, uses default navigation
   */
  navLinks?: Array<{
    to?: string
    href?: string
    label: string
  }>

  /**
   * Optional custom action button (e.g., "Play Now")
   * If not provided, shows login button or user profile dropdown
   */
  actionButton?: React.ReactNode
}

/**
 * Header component for CloutCards
 *
 * Displays navigation links and user authentication controls.
 * Features a responsive hamburger menu for mobile devices.
 *
 * @param props - Header component props
 * @returns Header JSX element
 */
export function Header({ onLoginClick, navLinks, actionButton }: HeaderProps) {
  const { address, isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address

  // Default navigation links
  const defaultNavLinks = [
    { to: '/', label: 'Home' },
    { to: '/play', label: 'Tables' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ]

  const links = navLinks || defaultNavLinks

  /**
   * Toggles the mobile menu open/closed state
   */
  function toggleMobileMenu() {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  /**
   * Closes the mobile menu
   */
  function closeMobileMenu() {
    setIsMobileMenuOpen(false)
  }

  /**
   * Handles login button click
   */
  function handleLoginClick() {
    closeMobileMenu()
    if (onLoginClick) {
      onLoginClick()
    }
  }

  return (
    <header className="header">
      <nav className="header-nav">
        {/* Mobile hamburger button */}
        <button
          className="header-mobile-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
        </button>

        {/* Desktop navigation */}
        <div className="header-nav-desktop">
          {links.map((link, index) => (
            <div key={index}>
              {link.to ? (
                <Link to={link.to} className="nav-link" onClick={closeMobileMenu}>
                  {link.label}
                </Link>
              ) : (
                <a href={link.href} className="nav-link" onClick={closeMobileMenu}>
                  {link.label}
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Desktop action area */}
        <div className="header-action-desktop">
          {actionButton || (
            isFullyLoggedIn && twitterUser && address ? (
              <UserProfileDropdown twitterUser={twitterUser} address={address} />
            ) : (
              <button
                className="header-login-button"
                onClick={handleLoginClick}
              >
                Log In
              </button>
            )
          )}
        </div>

        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="header-mobile-overlay" onClick={closeMobileMenu} />
        )}

        {/* Mobile navigation menu */}
        <div className={`header-nav-mobile ${isMobileMenuOpen ? 'open' : ''}`}>
          {links.map((link, index) => (
            <div key={index} className="header-mobile-link">
              {link.to ? (
                <Link to={link.to} className="nav-link" onClick={closeMobileMenu}>
                  {link.label}
                </Link>
              ) : (
                <a href={link.href} className="nav-link" onClick={closeMobileMenu}>
                  {link.label}
                </a>
              )}
            </div>
          ))}
          <div className="header-mobile-action">
            {actionButton || (
              isFullyLoggedIn && twitterUser && address ? (
                <UserProfileDropdown twitterUser={twitterUser} address={address} />
              ) : (
                <button
                  className="header-login-button"
                  onClick={handleLoginClick}
                >
                  Log In
                </button>
              )
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}

