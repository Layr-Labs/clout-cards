# Contract Deployment Guide

This guide covers deploying the CloutCards smart contract to any Ethereum-compatible network.

## Prerequisites

1. **Foundry** - For compiling Solidity contracts
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Node.js** - For running the deployment script
   ```bash
   node --version  # Should be >= 18.0.0
   ```

3. **Private Key** - For signing deployment transactions
   - For local Anvil: Use `--default-anvil-key` flag (see below)
   - For testnets/mainnet: Provide via `DEPLOYER_PRIVATE_KEY` env var or as command argument

4. **Funded Wallet** - The deployer address must have enough ETH to pay for gas

5. **TEE Public Key** - The house address (TEE public key) for initializing the contract
   - Get it from your backend: `curl http://localhost:8000/tee/publicKey`
   - Or use the TEE wallet address directly

## Quick Start

### Deploy to Local Anvil

```bash
# Start Anvil (in a separate terminal)
anvil

# Get TEE public key
curl http://localhost:8000/tee/publicKey

# Deploy using default Anvil key
npx ts-node scripts/deploy-clout-cards.ts \
  http://localhost:8545 \
  0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d \
  --default-anvil-key
```

### Deploy to Testnet (e.g., Base Sepolia)

```bash
# Set your deployer private key
export DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere

# Get TEE public key from your backend
TEE_PUBLIC_KEY=$(curl -s https://your-backend.com/tee/publicKey | jq -r '.publicKey')

# Deploy
npx ts-node scripts/deploy-clout-cards.ts \
  https://sepolia.base.org \
  $TEE_PUBLIC_KEY \
  $DEPLOYER_PRIVATE_KEY
```

## Deployment Script Usage

```bash
npx ts-node scripts/deploy-clout-cards.ts <rpc-url> <house-address> [deployer-private-key] [--upgrade <proxy-address>] [--default-anvil-key]
```

### Arguments

- **`rpc-url`** (required): RPC endpoint URL
  - Local: `http://localhost:8545`
  - Base Sepolia: `https://sepolia.base.org`
  - Custom: Your RPC provider URL

- **`house-address`** (required): TEE house address (public key)
  - Get from backend: `GET /tee/publicKey`
  - Must be a valid Ethereum address (0x...)

- **`deployer-private-key`** (optional): Private key for deployer wallet
  - If not provided, uses `DEPLOYER_PRIVATE_KEY` env var
  - For local Anvil with default key, use `--default-anvil-key` flag instead

### Flags

- **`--default-anvil-key`**: Use Anvil's default account for local development
  - Only works with local Anvil instances
  - Requires confirmation prompt
  - **WARNING**: Never use in production!

- **`--upgrade <proxy-address>`**: Upgrade existing proxy instead of deploying new
  - Requires proxy address as argument
  - Deploys new implementation and upgrades proxy

## Examples

### New Deployment

```bash
# Local Anvil with default key
npx ts-node scripts/deploy-clout-cards.ts \
  http://localhost:8545 \
  0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d \
  --default-anvil-key

# Local Anvil with custom key
npx ts-node scripts/deploy-clout-cards.ts \
  http://localhost:8545 \
  0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d \
  0xYourPrivateKey

# Testnet with env var
export DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
npx ts-node scripts/deploy-clout-cards.ts \
  https://sepolia.base.org \
  0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d
```

### Upgrade Existing Contract

```bash
npx ts-node scripts/deploy-clout-cards.ts \
  http://localhost:8545 \
  0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d \
  0xYourPrivateKey \
  --upgrade 0xProxyAddress
```

## Deployment Output

After successful deployment, you'll see:

```
✅ Deployment complete!
   Implementation: 0x...
   Proxy: 0x...
   Owner: 0x...
   House: 0x...

📝 Next steps:
   1. Verify the contract on block explorer
   2. Set the proxy address as the CloutCards contract address
   3. Use proxy address (0x...) for all interactions
```

**Important**: Always use the **proxy address** (not the implementation address) for all contract interactions.

## Setting Contract Address

### Local Development

Set the contract address when starting the dev server:

```bash
# Option 1: Set inline (one-time use)
CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress npm run dev:full

# Option 2: Export for current shell session
export CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress
npm run dev:full

# Option 3: One-liner with export
export CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress && npm run dev:full

# Option 4: Add to .env file (persists across sessions)
echo "CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress" >> .env
npm run dev:full
```

### Production

Add to your `.env` file:

```env
CLOUTCARDS_CONTRACT_ADDRESS=0xYourProxyAddress
```

The backend will read this from the environment variable.

## Contract Architecture

The CloutCards contract uses the **UUPS (Universal Upgradeable Proxy Standard)** pattern:

- **Implementation Contract**: Contains the actual logic
- **Proxy Contract**: Forwards calls to the implementation and stores state
- **Initialization**: Contract is initialized with owner and house address

### Why Use Proxy?

- **Upgradeability**: Update contract logic without changing the address
- **State Preservation**: User balances and data persist across upgrades
- **Single Address**: Users always interact with the same proxy address

## Security Considerations

1. **Private Keys**
   - Never commit private keys to version control
   - Use environment variables or command arguments
   - For local dev only: `--default-anvil-key` flag

2. **House Address**
   - Must be the TEE's public key (address)
   - Get it from your backend's `/tee/publicKey` endpoint
   - Verify it matches your TEE wallet

3. **Owner Address**
   - Set during initialization
   - Has permission to upgrade the contract
   - Should be a secure, controlled address

4. **Upgrades**
   - Only owner can upgrade
   - Always test upgrades on testnet first
   - Verify new implementation before upgrading

## Troubleshooting

### "nonce has already been used"

The script now handles nonces automatically. If you still see this error:
- Ensure previous transactions are confirmed
- Wait a few seconds between deployments
- Check that you're using the correct wallet

### "Failed to load UUPSProxy artifact"

Ensure OpenZeppelin contracts are compiled:

```bash
cd onchain
forge build
```

### "Insufficient funds"

Ensure your deployer wallet has enough ETH:
- Local Anvil: Default accounts are pre-funded
- Testnets: Use a faucet to fund your address
- Mainnet: Ensure sufficient balance for gas

### "Invalid house address"

Verify the house address is:
- A valid Ethereum address (0x + 40 hex chars)
- Not the zero address
- The actual TEE public key from your backend

## Network-Specific Notes

### Local Anvil

- Chain ID: `31337`
- Default accounts are pre-funded with 10,000 ETH
- Use `--default-anvil-key` for convenience (local only!)

### Base Sepolia

- Chain ID: `84532`
- RPC: `https://sepolia.base.org`
- Faucet: [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)

### Base Mainnet

- Chain ID: `8453`
- RPC: Use a reliable provider (Infura, Alchemy, etc.)
- **WARNING**: Real ETH - test thoroughly on testnet first!

## Next Steps

After deployment:

1. **Verify Contract**: Verify on block explorer (Etherscan, Basescan, etc.)
2. **Set Address**: Add `CLOUTCARDS_CONTRACT_ADDRESS` to your `.env`
3. **Test Interactions**: Test deposits, withdrawals, and other functions
4. **Monitor**: Watch for events and transactions

## Related Documentation

- [Configuration Guide](./README-CONFIGURATION.md) - Environment variables and setup
- [Database Guide](./README-DATABASE.md) - Database setup and migrations
- [Onchain README](./onchain/README.md) - Smart contract details

