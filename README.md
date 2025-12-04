# clout-cards

## Development

### Quick Start: Reset Development Environment

To completely reset your development environment (tear down Docker, restart services, migrate database, and deploy contract):

```bash
npx ts-node scripts/reset-dev-env.ts
```

This script will:
1. Stop and remove all Docker containers and volumes
2. Start fresh Docker containers (PostgreSQL and Anvil)
3. Wait for services to be ready
4. Run database migrations
5. Deploy the CloutCards contract (using `--default-anvil-key --skip-confirmation` for automation)
6. Display the contract proxy address

After running, you can start the dev server with the displayed contract address.

**Note**: The reset script runs without user interaction. For manual contract deployments, see [Deployment Guide](./README-DEPLOYMENT.md).

### Setup & Local Testing

1. **Install dependencies**:
```bash
npm install
cd frontend && npm install && cd ..
```

2. **Reset development environment** (recommended for fresh start):
```bash
npx ts-node scripts/reset-dev-env.ts
```

   Or manually:

   **Start local services** (PostgreSQL and Anvil):
   ```bash
   docker-compose up -d
   ```

   **Deploy contract** (in a new terminal):
   ```bash
   # Get TEE public key from backend (if running)
   TEE_PUBLIC_KEY=$(curl -s http://localhost:8000/tee/publicKey | jq -r '.publicKey' || echo "0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d")

   # Deploy contract
   npx ts-node scripts/deploy-clout-cards.ts \
     http://localhost:8545 \
     $TEE_PUBLIC_KEY \
     --default-anvil-key

   # Copy the proxy address from output
   ```

3. **Start full dev server** (backend + frontend):
```bash
# Option 1: Set inline (one-time use)
IS_LOCAL=true CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress npm run dev:full

# Option 2: Export for current shell session
export IS_LOCAL=true
export CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress
npm run dev:full

# Option 3: One-liner with export
export IS_LOCAL=true && export CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress && npm run dev:full

# Option 4: Add to .env file (persists across sessions)
echo "IS_LOCAL=true" >> .env
echo "CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress" >> .env
npm run dev:full
```

The `dev:full` script starts both backend (port 8000) and frontend (port 5173) concurrently.

### Individual Services

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

### Docker Testing
```bash
docker build -t my-app .
docker run --rm --env-file .env my-app
```

## Prerequisites

Before deploying, you'll need:

- **Docker** - To package and publish your application image
  - [Download Docker](https://www.docker.com/get-started/)
  - You'll also need to `docker login` to push images to your registry
- **ETH** - To pay for deployment transactions
  - For Sepolia testnet: [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy Faucet](https://sepoliafaucet.com/)

## Deployment

```bash
# Store your private key (generate new or use existing)
eigenx auth generate --store
# OR: eigenx auth login (if you have an existing key)

eigenx app deploy username/image-name
```

The CLI will automatically detect the `Dockerfile` and build your app before deploying.

## Management & Monitoring

### App Lifecycle
```bash
eigenx app list                    # List all apps
eigenx app info [app-name]         # Get app details
eigenx app logs [app-name]         # View logs
eigenx app start [app-name]        # Start stopped app
eigenx app stop [app-name]         # Stop running app
eigenx app terminate [app-name]    # Terminate app
eigenx app upgrade [app-name] [image] # Update deployment
eigenx app configure tls            # Configure TLS
```

### App Profile
```bash
eigenx app profile set [app-id]  # Set app name, website, description, social links, and icon
```

## TLS Configuration (Optional)

This project includes **optional** automatic TLS certificate management using Caddy. The Caddyfile is not required - if you don't need TLS termination or prefer to handle it differently, you can simply delete the Caddyfile.

### How It Works

When a `Caddyfile` is present in your project root:
- Caddy will automatically start as a reverse proxy
- It handles TLS certificate acquisition and renewal via Let's Encrypt
- Your app runs on `APP_PORT` and Caddy forwards HTTPS traffic to it
- Certificates are stored persistently in the TEE's encrypted storage

Without a `Caddyfile`:
- Your application runs directly on the configured ports
- You can handle TLS in your application code or use an external load balancer

### Deployment Checklist

Before deploying with TLS:
1. **Configure TLS**: Run `eigenx app configure tls` to add the necessary configuration files for domain setup with private traffic termination in the TEE.
2. **DNS**: Ensure A/AAAA record points to your instance (or reserved static IP). Note: If this is your first deployment, you will need to get your IP after deployment from the `eigenx app info` command.
3. **Required configuration** in `.env`:
   ```bash
   DOMAIN=mydomain.com          # Your domain name
   APP_PORT=8000               # Your app's port
   ACME_STAGING=true           # Test with staging first to avoid rate limits
   ENABLE_CADDY_LOGS=true      # Enable logs for debugging
   ```

4. **Optional ACME configuration** (all optional, with sensible defaults):
   ```bash
   # ACME email for Let's Encrypt notifications
   ACME_EMAIL=admin@example.com

   # Certificate Authority directory URL
   # Default: https://acme-v02.api.letsencrypt.org/directory
   ACME_CA=https://acme-v02.api.letsencrypt.org/directory

   # ACME Challenge Type
   # How to prove domain ownership to Let's Encrypt
   # Both result in the same TLS certificate, just different validation methods:
   # - http-01: Uses port 80 (default)
   # - tls-alpn-01: Uses port 443
   ACME_CHALLENGE=http-01

   # Use Let's Encrypt Staging (for testing)
   # Set to true to use staging environment (certificates won't be trusted by browsers)
   # Great for testing without hitting rate limits
   ACME_STAGING=true

   # Force certificate reissue
   # Set to true to force a new certificate even if one exists
   # This will delete the existing certificate from storage and get a new one
   ACME_FORCE_ISSUE=true
   ```

5. **Customize Caddyfile** (optional):
   - Edit `Caddyfile` to match your application port
   - Modify security headers as needed
   - Configure rate limiting or other middleware

### TLS Testing & Debugging

- **Enable Caddy logs** to see TLS-related output:
  ```bash
  ENABLE_CADDY_LOGS=true
  ```

- **Use Let's Encrypt staging** for testing (avoids rate limits, but certificates won't be trusted by browsers):
  ```bash
  ACME_STAGING=true
  ```

### Local Development

For local development without TLS, leave `DOMAIN` empty or set to `localhost` in your `.env` file.

### Custom Certificates

To use custom certificates instead of Let's Encrypt, modify the `Caddyfile`:
```caddyfile
tls /path/to/cert.pem /path/to/key.pem
```

## Documentation

- [Configuration Guide](./README-CONFIGURATION.md) - Environment variables and configuration
- [Deployment Guide](./README-DEPLOYMENT.md) - Smart contract deployment instructions
- [Database Guide](./README-DATABASE.md) - Database setup and migrations
- [EigenX CLI Documentation](https://github.com/Layr-Labs/eigenx-cli/blob/main/README.md)
