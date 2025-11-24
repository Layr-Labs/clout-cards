import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ethers } from 'ethers'

// Extend Window interface to include ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
      isMetaMask?: boolean
    }
  }
}

/**
 * Wallet connection context
 *
 * Manages wallet connection state and provides wallet connection/disconnection
 * functionality. Uses MetaMask or other injected providers.
 */

interface WalletContextType {
  address: string | null
  isConnected: boolean
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  provider: ethers.BrowserProvider | null
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

/**
 * Wallet provider component
 *
 * Wraps the application to provide wallet connection functionality.
 * Persists connection state in localStorage.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)

  /**
   * Loads saved wallet connection from localStorage on mount
   */
  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress')
    if (savedAddress) {
      checkConnection(savedAddress)
    }
  }, [])

  /**
   * Checks if a previously connected wallet is still connected
   */
  async function checkConnection(savedAddress: string) {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const accounts = await provider.listAccounts()
        const connectedAddress = accounts[0]?.address.toLowerCase()

        if (connectedAddress === savedAddress.toLowerCase()) {
          setAddress(connectedAddress)
          setProvider(provider)
        } else {
          // Address changed, clear saved state
          localStorage.removeItem('walletAddress')
        }
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error)
      localStorage.removeItem('walletAddress')
    }
  }

  /**
   * Connects to MetaMask or other injected wallet provider
   *
   * Uses `eth_requestAccounts` which will prompt the user if they haven't
   * approved the site, or silently reconnect if they have. To force a
   * re-prompt, the user must disconnect first (which revokes permissions).
   *
   * @throws {Error} If no wallet provider is found or connection fails
   */
  async function connectWallet() {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('No wallet provider found. Please install MetaMask.')
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      
      // Request accounts - this will prompt if permissions were revoked
      // or if the user hasn't approved the site before
      const accounts = await provider.send('eth_requestAccounts', [])

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please select an account in your wallet.')
      }

      const connectedAddress = accounts[0].toLowerCase()
      setAddress(connectedAddress)
      setProvider(provider)
      localStorage.setItem('walletAddress', connectedAddress)

      // Listen for account changes
      window.ethereum.on('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void)
      window.ethereum.on('chainChanged', handleChainChanged as (...args: unknown[]) => void)
    } catch (error) {
      console.error('Error connecting wallet:', error)
      throw error
    }
  }

  /**
   * Handles account changes from the wallet provider
   */
  function handleAccountsChanged(...args: unknown[]) {
    const accounts = args[0] as string[]
    if (!accounts || accounts.length === 0) {
      disconnectWallet()
    } else {
      const newAddress = accounts[0].toLowerCase()
      setAddress(newAddress)
      localStorage.setItem('walletAddress', newAddress)
    }
  }

  /**
   * Handles chain changes - reloads the page to ensure proper state
   */
  function handleChainChanged() {
    window.location.reload()
  }

  /**
   * Disconnects the wallet and clears saved state
   *
   * Attempts to revoke wallet permissions to ensure the user is prompted
   * again on next connection. Falls back gracefully if permission revocation
   * is not supported by the wallet provider.
   */
  async function disconnectWallet() {
    // Try to revoke permissions to force re-prompt on next connection
    try {
      if (window.ethereum && window.ethereum.request) {
        // Attempt to revoke permissions (some wallets support this)
        await window.ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        }).catch(() => {
          // Ignore errors - not all wallets support this
        })
      }
    } catch (error) {
      // Silently fail - permission revocation is optional
      console.debug('Could not revoke permissions:', error)
    }

    // Remove event listeners
    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void)
      window.ethereum.removeListener('chainChanged', handleChainChanged as (...args: unknown[]) => void)
    }

    // Clear local state
    setAddress(null)
    setProvider(null)
    localStorage.removeItem('walletAddress')
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        connectWallet,
        disconnectWallet,
        provider,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

/**
 * Hook to access wallet context
 *
 * @returns Wallet context value
 * @throws {Error} If used outside WalletProvider
 */
export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

