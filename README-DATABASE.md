# Database Setup

## Overview

This project uses **PostgreSQL** for both development and production. For local development, **no environment variables are required** - the application uses hardcoded defaults that match the Docker Compose setup.

The Docker Compose setup also includes **Anvil** (Foundry's local Ethereum node) for local blockchain testing. Anvil runs on chain ID 31337 by default, which matches the application's default `CHAIN_ID` for local development.

## Environment Detection

The application automatically detects the environment:

- **Production**: When `NODE_ENV=production` OR `ENVIRONMENT=production`
- **Local Development**: Otherwise (uses hardcoded defaults)

## Prerequisites

Before setting up the database, you need Docker and Docker Compose installed.

### Installing Docker and Docker Compose

#### macOS

1. **Install Docker Desktop** (includes Docker Compose):
   - Download from: https://www.docker.com/products/docker-desktop/
   - Or use Homebrew:
     ```bash
     brew install --cask docker
     ```
   - Open Docker Desktop from Applications to start the Docker daemon

2. **Verify installation**:
   ```bash
   docker --version
   docker compose version  # Docker Compose is included in Docker Desktop
   ```

#### Linux (Ubuntu/Debian)

1. **Install Docker**:
   ```bash
   # Update package index
   sudo apt-get update
   
   # Install prerequisites
   sudo apt-get install -y ca-certificates curl gnupg lsb-release
   
   # Add Docker's official GPG key
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   
   # Set up repository
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker Engine
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. **Add your user to docker group** (to run without sudo):
   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in for changes to take effect
   ```

3. **Verify installation**:
   ```bash
   docker --version
   docker compose version
   ```

#### Windows

1. **Install Docker Desktop** (includes Docker Compose):
   - Download from: https://www.docker.com/products/docker-desktop/
   - Follow the installation wizard
   - Restart your computer if prompted
   - Start Docker Desktop from the Start menu

2. **Verify installation**:
   ```bash
   docker --version
   docker compose version
   ```

### Verifying Docker is Running

Before proceeding, make sure Docker is running:

```bash
docker ps
```

If you see an error like "Cannot connect to the Docker daemon", start Docker Desktop (macOS/Windows) or the Docker service (Linux):

```bash
# Linux only
sudo systemctl start docker
sudo systemctl enable docker  # Enable auto-start on boot
```

## Local Development

### Quick Start (No Configuration Required)

1. **Start PostgreSQL and Anvil**:
   ```bash
   docker-compose up -d
   ```

   This will:
   - Download the PostgreSQL 16 image (first time only)
   - Download the Foundry image (first time only)
   - Create containers: `clout-cards-postgres` and `clout-cards-anvil`
   - Start PostgreSQL on port 5432
   - Start Anvil (local Ethereum node) on port 8545 (chain ID 31337)
   - Create database `cloutcards_dev` with user `cloutcards`

2. **Verify services are running**:
   ```bash
   docker ps
   ```
   
   You should see both `clout-cards-postgres` and `clout-cards-anvil` running.

3. **Run migrations**:
   ```bash
   npx prisma migrate dev
   ```

4. **Create genesis event** (optional, but recommended):
   ```bash
   npx ts-node scripts/create-genesis-event.ts
   ```
   
   Note: `CHAIN_ID` defaults to 31337 (Anvil) for local development, so no env vars needed.

That's it! No `.env` file needed. The application uses these defaults:
- **Host**: `localhost`
- **Port**: `5432`
- **Username**: `cloutcards`
- **Password**: `cloutcards`
- **Database**: `cloutcards_dev`

These defaults match the `docker-compose.yml` configuration.

### Stopping the Database

To stop PostgreSQL:
```bash
docker-compose down
```

To stop and remove all data (fresh start):
```bash
docker-compose down -v
```

### Viewing Database Logs

```bash
docker-compose logs postgres
```

### Connecting to the Database Manually

You can connect using any PostgreSQL client:

```bash
# Using psql (if installed)
psql -h localhost -p 5432 -U cloutcards -d cloutcards_dev
# Password: cloutcards

# Or using Docker
docker exec -it clout-cards-postgres psql -U cloutcards -d cloutcards_dev
```

### Using Anvil (Local Ethereum Node)

Anvil is included in the Docker Compose setup for local blockchain testing:

- **RPC URL**: `http://localhost:8545`
- **Chain ID**: `31337` (default)
- **WebSocket**: `ws://localhost:8546` (optional)

The application defaults to chain ID 31337 for local development, matching Anvil's default.

**Useful Anvil commands**:

```bash
# View Anvil logs
docker-compose logs anvil

# Restart Anvil (resets blockchain state)
docker-compose restart anvil

# Stop Anvil (keep PostgreSQL running)
docker-compose stop anvil
```

**Note**: Anvil is optional - if you prefer to use a testnet (like Base Sepolia), you can:
1. Set `CHAIN_ID=84532` in your environment
2. Use your testnet RPC URL instead of Anvil
3. Stop the Anvil container: `docker-compose stop anvil`

### Funding Wallets with ETH

Anvil comes with **10 pre-funded accounts**, each with **10,000 ETH**. These accounts are available immediately for testing.

**View pre-funded accounts**:
```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":1}'
```

**Check balance**:
```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","latest"],"id":1}'
```

**Fund a custom wallet** (using the helper script):
```bash
# Fund 10 ETH (default) to an address
npx ts-node scripts/fund-wallet.ts 0x1234...abcd

# Fund a specific amount
npx ts-node scripts/fund-wallet.ts 0x1234...abcd 50
```

**Anvil's default account** (used by the funding script):
- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Balance: 10,000 ETH

**Note**: Never use Anvil's private keys in production! They are well-known and only for local testing.

### Custom Local Setup (Optional)

If you need different database settings locally, you can override defaults with environment variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=myuser
DB_PASSWORD=mypass
DB_NAME=mydb
```

## Production (AWS RDS)

**All environment variables are required in production:**

```env
NODE_ENV=production
# OR
ENVIRONMENT=production

DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_USERNAME=your_rds_username
DB_PASSWORD=your_rds_password
DB_NAME=your_database_name
DB_PORT=5432  # Optional, defaults to 5432
```

The application will automatically:
- Detect production mode from `NODE_ENV` or `ENVIRONMENT`
- Require all database connection variables
- Throw clear errors if any are missing

## Migrations

- **Development**: `npx prisma migrate dev`
- **Production**: `npx prisma migrate deploy`

## Why This Approach?

1. **Zero Configuration for Local Dev**: Developers can start immediately without setting up `.env` files
2. **No .env.local Needed**: Defaults are hardcoded and match Docker Compose
3. **Prevents Configuration Errors**: Can't forget to set variables locally
4. **Production Safety**: Still requires all variables in production to prevent misconfigurations
5. **Flexibility**: Can still override defaults if needed for custom local setups

## Error Handling

In production, the application will throw clear errors if required variables are missing:

- `DB_USERNAME environment variable is required in production`
- `DB_PASSWORD environment variable is required in production`
- `DB_NAME environment variable is required in production`
- `DB_HOST environment variable is required in production`
