import { useEffect, useRef } from 'react'
import jazzicon from '@metamask/jazzicon'

/**
 * Wallet avatar component using Jazzicon
 *
 * Generates a deterministic colorful avatar based on the wallet address.
 * Jazzicon creates a unique, colorful pattern for each address.
 *
 * @param address - Ethereum wallet address (0x...)
 * @param size - Size of the avatar in pixels (default: 40)
 */
export function WalletAvatar({ address, size = 40 }: { address: string; size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && address) {
      // Clear any existing content
      containerRef.current.innerHTML = ''

      // Generate jazzicon (size is in pixels, we need to divide by 2 for the library)
      const icon = jazzicon(size, parseInt(address.slice(2, 10), 16))
      containerRef.current.appendChild(icon)
    }
  }, [address, size])

  return <div ref={containerRef} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }} />
}

