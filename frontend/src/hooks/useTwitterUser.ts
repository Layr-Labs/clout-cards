import { useState, useEffect } from 'react'
import { getTwitterUser, type TwitterUser } from '../services/twitter'

/**
 * Custom hook to load and manage Twitter user from stored access token
 *
 * Automatically loads Twitter user information from localStorage on mount.
 * Clears invalid tokens if the API call fails.
 *
 * @returns Twitter user object if authenticated, null otherwise
 */
export function useTwitterUser(): TwitterUser | null {
  const [twitterUser, setTwitterUser] = useState<TwitterUser | null>(null)

  useEffect(() => {
    async function loadTwitterUser() {
      const storedToken = localStorage.getItem('twitterAccessToken')
      if (storedToken) {
        try {
          const user = await getTwitterUser(storedToken)
          setTwitterUser(user)
        } catch (error) {
          // Token invalid, clear it
          localStorage.removeItem('twitterAccessToken')
          localStorage.removeItem('twitterRefreshToken')
          setTwitterUser(null)
        }
      } else {
        setTwitterUser(null)
      }
    }

    loadTwitterUser()
  }, [])

  return twitterUser
}

