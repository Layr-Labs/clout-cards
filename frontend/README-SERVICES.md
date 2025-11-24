# Frontend Service Layer Documentation

## Overview

The frontend service layer provides a clean abstraction for making RPC calls to the TEE backend from React components. It handles environment configuration, request/response formatting, error handling, and timeouts.

**Note**: This service layer is **frontend-only**. The backend does not include a TEE service layer and does not make RPC calls to the TEE backend.

## Configuration

### Environment Variables

The service layer uses Vite environment variables (prefixed with `VITE_`) to configure the TEE backend connection:

#### Required (Production)
- `VITE_TEE_ENDPOINT` - Full URL of the TEE backend (e.g., `https://tee.example.com`)

#### Optional
- `VITE_TEE_TIMEOUT` - Request timeout in milliseconds (default: 30000ms / 30 seconds)
- `VITE_TEE_API_VERSION` - API version to use (default: `v1`)
- `VITE_ENVIRONMENT` - Set to `production` to enable production mode

### Local Development

For local development, if `VITE_TEE_ENDPOINT` is not set, the service defaults to:
- `http://localhost:8000`

This allows developers to run locally without setting environment variables.

### Production

In production (when `NODE_ENV=production` or `VITE_ENVIRONMENT=production`), `VITE_TEE_ENDPOINT` **must** be set, otherwise the application will throw an error.

### Environment File Setup

Create a `.env` file in the `frontend/` directory:

```env
# Local development (optional - defaults to http://localhost:8000)
VITE_TEE_ENDPOINT=http://localhost:8000
VITE_TEE_TIMEOUT=30000
VITE_TEE_API_VERSION=v1

# Production (required)
# VITE_TEE_ENDPOINT=https://tee.example.com
# VITE_ENVIRONMENT=production
```

**Note**: Vite requires environment variables to be prefixed with `VITE_` to be exposed to the client code.

## Usage

### Basic RPC Call

```typescript
import { callTeeRpc } from './services/tee';

// In a React component or hook
const result = await callTeeRpc('method_name', {
  param1: 'value1',
  param2: 123,
});
```

### Using in React Components

```typescript
import { useState, useEffect } from 'react';
import { callTeeRpc, TeeServiceError } from './services/tee';

function MyComponent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await callTeeRpc('get_data', { id: 123 });
        setData(result);
      } catch (err) {
        if (err instanceof TeeServiceError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

### Using in Custom Hooks

```typescript
import { useState, useCallback } from 'react';
import { callTeeRpc, TeeServiceError } from './services/tee';

function useTeeRpc<T = unknown>(method: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (params?: Record<string, unknown>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await callTeeRpc<T>(method, params);
      return result;
    } catch (err) {
      if (err instanceof TeeServiceError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [method]);

  return { call, loading, error };
}

// Usage
function MyComponent() {
  const { call, loading, error } = useTeeRpc('get_tables');

  const handleClick = async () => {
    const result = await call({ tableId: 1 });
    console.log(result);
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch Data'}
      </button>
      {error && <div>Error: {error}</div>}
    </div>
  );
}
```

### Error Handling

```typescript
import { callTeeRpc, TeeServiceError } from './services/tee';

try {
  const result = await callTeeRpc('method_name', { param: 'value' });
} catch (error) {
  if (error instanceof TeeServiceError) {
    console.error('TEE RPC error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error data:', error.data);
    
    // Handle specific error codes
    if (error.code === 408) {
      // Timeout error
      alert('Request timed out. Please try again.');
    } else if (error.code === 404) {
      // Not found
      alert('Resource not found.');
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Health Check

```typescript
import { checkTeeHealth } from './services/tee';

const isHealthy = await checkTeeHealth();
if (!isHealthy) {
  console.warn('TEE backend is not healthy');
  // Show user-friendly message
}
```

### Get TEE Info

```typescript
import { getTeeInfo } from './services/tee';

const info = await getTeeInfo();
console.log('TEE version:', info.version);
console.log('Chain ID:', info.chainId);
console.log('House address:', info.houseAddress);
```

## Architecture

### Service Layer Structure

```
frontend/src/
├── config/
│   └── env.ts          # Environment configuration
├── services/
│   ├── tee.ts          # TEE backend service
│   └── index.ts        # Service exports
```

### Key Components

1. **`config/env.ts`**: Centralized environment variable access using Vite's `import.meta.env`
2. **`services/tee.ts`**: TEE backend RPC client with error handling
3. **`services/index.ts`**: Central export point for services

## Error Types

### TeeServiceError

Custom error class for TEE service errors:

- `message`: Human-readable error message
- `code`: Optional error code from TEE backend
- `data`: Optional additional error data

### Common Error Scenarios

1. **Network Error**: Connection refused, DNS failure, CORS issues, etc.
   - Throws `TeeServiceError` with network error details

2. **Timeout**: Request exceeds `VITE_TEE_TIMEOUT`
   - Throws `TeeServiceError` with code 408 (Request Timeout)

3. **HTTP Error**: Non-200 HTTP status code
   - Throws `TeeServiceError` with HTTP status code

4. **RPC Error**: TEE backend returns an error in the RPC response
   - Throws `TeeServiceError` with RPC error code and message

## Example: Adding a New RPC Method

```typescript
// In src/services/tee.ts or a new service file

/**
 * Gets all tables from TEE backend
 *
 * @returns List of tables
 */
export async function getTables(): Promise<Array<{
  id: string;
  name: string;
  maxSeats: number;
  [key: string]: unknown;
}>> {
  return callTeeRpc('get_tables');
}

/**
 * Creates a new table via TEE backend
 *
 * @param tableConfig - Table configuration
 * @returns Created table information
 */
export async function createTable(tableConfig: {
  maxSeats: number;
  minBuyIn: string;
  maxBuyIn: string;
  smallBlind: string;
  bigBlind: string;
  rakePercentage: number;
}): Promise<{ tableId: string; createdAt: string }> {
  return callTeeRpc('create_table', tableConfig);
}
```

## Best Practices

1. **Always use the service layer** - Don't make direct fetch calls to TEE backend
2. **Handle errors appropriately** - Use `TeeServiceError` for TEE-specific errors
3. **Set appropriate timeouts** - Use shorter timeouts for health checks
4. **Show user-friendly errors** - Display meaningful error messages to users
5. **Use loading states** - Show loading indicators during RPC calls
6. **Don't expose TEE internals** - Keep TEE endpoint configuration in environment variables
7. **Use React hooks** - Create custom hooks for common RPC patterns

## CORS Considerations

If your TEE backend is on a different origin, ensure CORS is properly configured:

- TEE backend must allow requests from your frontend origin
- Include appropriate CORS headers in TEE backend responses
- For local development, TEE backend should allow `http://localhost:5173` (Vite default)

## Testing

When testing, you can mock the service layer:

```typescript
import { callTeeRpc } from './services/tee';

jest.mock('./services/tee', () => ({
  callTeeRpc: jest.fn(),
}));

// In your test
import { callTeeRpc } from './services/tee';

(callTeeRpc as jest.Mock).mockResolvedValue({ result: 'test' });
```

