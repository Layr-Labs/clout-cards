# Configuration Guide

This document outlines all environment variables and configuration needed for both frontend and backend components of the CloutCards application.

## Overview

The CloutCards application consists of:
- **Backend**: Express.js server (Node.js/TypeScript)
- **Frontend**: React application (Vite)
- **Database**: PostgreSQL (local via Docker Compose, production via AWS RDS)
- **Blockchain**: Anvil (local) or production network

## Backend Configuration

### Required Environment Variables

#### Production Only
- `DB_HOST` - PostgreSQL host (RDS endpoint)
- `DB_USERNAME` - PostgreSQL username
- `DB_PASSWORD` - PostgreSQL password
- `DB_NAME` - PostgreSQL database name
- `CHAIN_ID` - Ethereum chain ID (e.g., `84532` for Base Sepolia)
- `MNEMONIC` - TEE wallet mnemonic for signing events
- `APP_PORT` - Express server port (defaults to `3000` if not set)

#### Optional
- `DB_PORT` - PostgreSQL port (defaults to `5432`)
- `TEE_VERSION` - TEE binary version (defaults to `1`)
- `ADMIN_ADDRESSES` - Comma-separated list of admin addresses (production only, defaults to empty)
- `CLOUTCARDS_CONTRACT_ADDRESS` - Address of the deployed CloutCards proxy contract (required for contract interactions)
- `NODE_ENV` - Set to `production` to enable production mode
- `ENVIRONMENT` - Alternative to `NODE_ENV`, set to `production` for production mode

### Local Development Defaults

The backend uses hardcoded defaults for local development (no env vars needed):

- **Database**: `localhost:5432` / `cloutcards` / `cloutcards` / `cloutcards_dev`
- **Chain ID**: `31337` (Anvil default)
- **Server Port**: `3000`
- **Admin Addresses**: Anvil's first default address (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)
- **Contract Address**: Not set by default - must be provided via `CLOUTCARDS_CONTRACT_ADDRESS` env var or command line

### Backend Environment Detection

Production mode is enabled when:
- `NODE_ENV === 'production'` OR
- `ENVIRONMENT === 'production'`

Otherwise, local development defaults are used.

## Frontend Configuration

### Required Environment Variables

#### Production Only
- `VITE_TEE_ENDPOINT` - Full URL of the TEE backend (e.g., `https://tee.example.com`)

**Important**: Vite requires environment variables to be prefixed with `VITE_` to be exposed to client code.

#### Optional
- `VITE_TEE_TIMEOUT` - Request timeout in milliseconds (default: `30000` / 30 seconds)
- `VITE_TEE_API_VERSION` - API version to use (default: `v1`)
- `VITE_ENVIRONMENT` - Set to `production` to enable production mode

### Local Development Defaults

The frontend uses hardcoded defaults for local development (no env vars needed):

- **TEE Endpoint**: `http://localhost:8000`
- **Timeout**: `30000ms` (30 seconds)
- **API Version**: `v1`

### Frontend Environment Detection

Production mode is enabled when:
- `import.meta.env.MODE === 'production'` OR
- `VITE_ENVIRONMENT === 'production'`

Otherwise, local development defaults are used.

## Environment File Setup

### Backend `.env` (Root Directory)

```env
# Production Database (required in production)
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_NAME=your_database

# Blockchain (required in production)
CHAIN_ID=84532

# TEE (required in production)
MNEMONIC=your twelve word mnemonic phrase here

# Admins (optional - defaults to empty array if not set)
ADMIN_ADDRESSES=0x1234567890123456789012345678901234567890,0xabcdefabcdefabcdefabcdefabcdefabcdefabcd

# Server (optional)
APP_PORT=3000
TEE_VERSION=1

# Contract Address (required for contract interactions)
CLOUTCARDS_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890

# Environment (optional - set to 'production' for production)
NODE_ENV=production
# OR
ENVIRONMENT=production
```

### Frontend `.env` (Frontend Directory)

```env
# TEE Backend (required in production)
VITE_TEE_ENDPOINT=https://tee.example.com

# Optional
VITE_TEE_TIMEOUT=30000
VITE_TEE_API_VERSION=v1
VITE_ENVIRONMENT=production
```

**Note**: For local development, you don't need to create `.env` files - the application will use hardcoded defaults.

## Service Architecture

### Backend Services

The backend does **NOT** include a TEE service layer or make RPC calls to the TEE backend. The backend:
- Manages database connections and migrations
- Handles event logging and EIP-712 signing (using `MNEMONIC` env var)
- Provides Express API endpoints
- Does **NOT** make RPC calls to TEE backend
- Does **NOT** need `TEE_ENDPOINT` or any TEE-related environment variables

### Frontend Services

The frontend includes a TEE service layer (`frontend/src/services/tee.ts`) that:
- Makes RPC calls to the TEE backend
- Handles request/response formatting
- Provides error handling and timeouts
- Uses environment-based configuration (via `VITE_TEE_ENDPOINT`)

## Quick Reference

### Local Development

**Backend**:
- No `.env` file needed
- Database: Docker Compose (PostgreSQL on `localhost:5432`)
- Chain: Anvil (chain ID `31337`)
- Server: `http://localhost:3000`

**Frontend**:
- No `.env` file needed
- TEE Backend: `http://localhost:8000` (default)
- Dev Server: `http://localhost:5173` (Vite default)

### Production

**Backend**:
- `.env` file required with:
  - `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
  - `CHAIN_ID`
  - `MNEMONIC`
  - `ADMIN_ADDRESSES` (optional - comma-separated list of admin addresses)
  - `NODE_ENV=production` or `ENVIRONMENT=production`

**Frontend**:
- `.env` file required with:
  - `VITE_TEE_ENDPOINT`
  - `VITE_ENVIRONMENT=production` (optional, but recommended)

## Verification

### Backend Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok"
}
```

### Backend Admins Endpoint

```bash
curl http://localhost:8000/admins
```

Response (Local):
```json
["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]
```

Response (Production):
```json
["0x1234567890123456789012345678901234567890","0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"]
```

Or empty array if `ADMIN_ADDRESSES` is not set:
```json
[]
```

### Frontend TEE Health Check

The frontend can check TEE backend health using:

```typescript
import { checkTeeHealth } from './services/tee';

const isHealthy = await checkTeeHealth();
```

## Troubleshooting

### Backend Issues

1. **Database Connection Errors**
   - Verify Docker Compose is running: `docker-compose ps`
   - Check database credentials match Docker Compose config
   - Ensure `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` are set in production

2. **Chain ID Errors**
   - Local: Should default to `31337` (Anvil)
   - Production: Must set `CHAIN_ID` environment variable

3. **TEE Signing Errors** (for event signing, not RPC calls)
   - Ensure `MNEMONIC` is set in production
   - Verify mnemonic is valid (12 words)
   - Note: Backend does NOT make RPC calls to TEE - only signs events

### Frontend Issues

1. **TEE Connection Errors**
   - Verify TEE backend is running on expected port
   - Check `VITE_TEE_ENDPOINT` is set correctly in production
   - Ensure CORS is configured on TEE backend

2. **Environment Variables Not Working**
   - Remember: Frontend env vars must be prefixed with `VITE_`
   - Restart Vite dev server after changing `.env` file
   - Check `import.meta.env` in browser console

3. **CORS Errors**
   - TEE backend must allow requests from frontend origin
   - For local dev: TEE should allow `http://localhost:5173`

## Summary

| Component | Local Defaults | Production Required |
|-----------|----------------|-------------------|
| **Backend** | | |
| Database | `localhost:5432` / `cloutcards` / `cloutcards` / `cloutcards_dev` | `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` |
| Chain ID | `31337` (Anvil) | `CHAIN_ID` |
| TEE Mnemonic | N/A | `MNEMONIC` (for signing events) |
| Server Port | `3000` | `APP_PORT` (optional) |
| Admin Addresses | Anvil default (`0xf39Fd6...`) | `ADMIN_ADDRESSES` (comma-separated, optional) |
| Contract Address | Not set (must provide) | `CLOUTCARDS_CONTRACT_ADDRESS` |
| TEE Endpoint | **N/A** - Backend does not call TEE | **N/A** |
| **Frontend** | | |
| TEE Endpoint | `http://localhost:8000` | `VITE_TEE_ENDPOINT` |
| Timeout | `30000ms` | `VITE_TEE_TIMEOUT` (optional) |
| API Version | `v1` | `VITE_TEE_API_VERSION` (optional) |

