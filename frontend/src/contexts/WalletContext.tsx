import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ethers } from 'ethers'
import { getSessionMessage } from '../services/session'

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
  isLoggedIn: boolean // True if wallet is connected AND has a valid signature
  signature: string | null // The signed session message signature
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
  const [signature, setSignature] = useState<string | null>(null)

  /**
   * Loads saved wallet connection and signature from localStorage on mount
   */
  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress')
    const savedSignature = localStorage.getItem('walletSignature')
    
    if (savedAddress && savedSignature) {
      checkConnection(savedAddress, savedSignature)
    } else if (savedAddress) {
      // Address saved but no signature - clear it and require re-sign
      localStorage.removeItem('walletAddress')
    }
  }, [])

  /**
   * Checks if a previously connected wallet is still connected and has valid signature
   */
  async function checkConnection(savedAddress: string, savedSignature: string) {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const accounts = await provider.listAccounts()
        const connectedAddress = accounts[0]?.address.toLowerCase()

        if (connectedAddress === savedAddress.toLowerCase()) {
          setAddress(connectedAddress)
          setProvider(provider)
          setSignature(savedSignature)
        } else {
          // Address changed, clear saved state
          localStorage.removeItem('walletAddress')
          localStorage.removeItem('walletSignature')
          setSignature(null)
        }
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error)
      localStorage.removeItem('walletAddress')
      localStorage.removeItem('walletSignature')
      setSignature(null)
    }
  }

  /**
   * Connects to MetaMask or other injected wallet provider and signs session message
   *
   * Uses `eth_requestAccounts` which will prompt the user if they haven't
   * approved the site, or silently reconnect if they have. To force a
   * re-prompt, the user must disconnect first (which revokes permissions).
   *
   * After connecting, requests a session message from the backend and prompts
   * the user to sign it. The signature is stored in localStorage as a session key.
   *
   * @throws {Error} If no wallet provider is found, connection fails, or signing fails
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

      // Get session message from backend
      const message = await getSessionMessage(connectedAddress)

      // Sign the message with the wallet
      const signer = await provider.getSigner()
      const signature = await signer.signMessage(message)

      // Store signature in localStorage
      setSignature(signature)
      localStorage.setItem('walletSignature', signature)

      // Listen for account changes
      window.ethereum.on('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void)
      window.ethereum.on('chainChanged', handleChainChanged as (...args: unknown[]) => void)
    } catch (error) {
      console.error('Error connecting wallet:', error)
      // Clear state on error
      setAddress(null)
      setProvider(null)
      setSignature(null)
      localStorage.removeItem('walletAddress')
      localStorage.removeItem('walletSignature')
      throw error
    }
  }

  /**
   * Handles account changes from the wallet provider
   * 
   * When account changes, clears signature and requires re-signing
   */
  function handleAccountsChanged(...args: unknown[]) {
    const accounts = args[0] as string[]
    if (!accounts || accounts.length === 0) {
      disconnectWallet()
    } else {
      const newAddress = accounts[0].toLowerCase()
      setAddress(newAddress)
      // Clear signature when account changes - user must re-sign
      setSignature(null)
      localStorage.setItem('walletAddress', newAddress)
      localStorage.removeItem('walletSignature')
    }
  }

  /**
   * Handles chain changes - reloads the page to ensure proper state
   */
  function handleChainChanged() {
    window.location.reload()
  }

  /**
   * Disconnects the wallet and clears saved state including signature
   *
   * Attempts to revoke wallet permissions to ensure the user is prompted
   * again on next connection. Falls back gracefully if permission revocation
   * is not supported by the wallet provider.
   * 
   * Clears both wallet address and signature from localStorage.
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

    // Clear local state and localStorage
    setAddress(null)
    setProvider(null)
    setSignature(null)
    localStorage.removeItem('walletAddress')
    localStorage.removeItem('walletSignature')
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        isLoggedIn: address !== null && signature !== null,
        signature,
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

