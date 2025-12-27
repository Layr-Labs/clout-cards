/**
 * Deployment script for CloutCards.sol contract
 *
 * This script deploys (or upgrades) the CloutCards UUPS upgradeable contract to any network.
 * It handles:
 * - Deploying the implementation contract
 * - Deploying a UUPS proxy
 * - Initializing the contract with owner and house address
 * - Optionally upgrading an existing proxy
 *
 * Usage:
 *   Deploy new contract:
 *     npx ts-node scripts/deploy-clout-cards.ts <rpc-url> <house-address> [deployer-private-key]
 *
 *   Upgrade existing contract:
 *     npx ts-node scripts/deploy-clout-cards.ts <rpc-url> <house-address> [deployer-private-key] --upgrade <proxy-address>
 *
 * Examples:
 *   # Deploy to local Anvil (using default key flag)
 *   npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd --default-anvil-key
 *
 *   # Deploy to local Anvil (skip confirmation prompt)
 *   npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd --default-anvil-key --skip-confirmation
 *
 *   # Deploy to Sepolia with private key as argument
 *   npx ts-node scripts/deploy-clout-cards.ts https://sepolia.infura.io/v3/YOUR_KEY 0x1234...abcd 0xYOUR_PRIVATE_KEY
 *
 *   # Upgrade existing contract
 *   npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd 0xYOUR_PRIVATE_KEY --upgrade 0xPROXY_ADDRESS
 *
 * Environment variables:
 *   - DEPLOYER_PRIVATE_KEY: Private key for deployer (required if not passed as argument)
 *
 * Security note:
 *   - NEVER commit private keys to version control
 *   - Always use environment variables or pass keys as arguments
 *   - For local development, use --default-anvil-key flag (only works with local Anvil)
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

dotenv.config();

/**
 * Anvil's default account (pre-funded with 10,000 ETH)
 * Only used when --default-anvil-key flag is explicitly provided
 */
const ANVIL_DEFAULT_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/**
 * Gets the UUPSProxy contract artifact from OpenZeppelin
 *
 * @returns Contract artifact with ABI and bytecode
 */
function getUUPSProxyArtifact(): { abi: any[]; bytecode: string } {
  // Try Foundry's out directory first (where compiled contracts go)
  try {
    const foundryPath = join(
      __dirname,
      '../onchain/out/ERC1967Proxy.sol/ERC1967Proxy.json'
    );
    const artifact = JSON.parse(readFileSync(foundryPath, 'utf-8'));
    return {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
    };
  } catch (error) {
    // Fallback: try OpenZeppelin's artifacts directory (if using Hardhat/Truffle)
    try {
      const erc1967Path = join(
        __dirname,
        '../onchain/lib/openzeppelin-contracts/artifacts/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json'
      );
      const artifact = JSON.parse(readFileSync(erc1967Path, 'utf-8'));
      return {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
      };
    } catch (err) {
      throw new Error(
        `Failed to load ERC1967Proxy artifact. Make sure to compile OpenZeppelin contracts:\n` +
          `  1. Create a script file that imports ERC1967Proxy (e.g., script/DeployProxy.s.sol)\n` +
          `  2. Run: cd onchain && forge build\n` +
          `  This will compile ERC1967Proxy and generate the artifact in out/ERC1967Proxy.sol/`
      );
    }
  }
}

/**
 * Prompts user to confirm using Anvil's default private key
 *
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function confirmDefaultAnvilKey(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.warn('⚠️  WARNING: You are about to use Anvil\'s default private key.');
    console.warn('   This should ONLY be used for local development!');
    console.warn('   Using this key on a public network could result in loss of funds.');
    console.warn('');
    
    rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y';
      if (!confirmed) {
        console.log('Confirmation denied. Exiting...');
      }
      resolve(confirmed);
    });
  });
}

/**
 * Gets the deployer wallet
 *
 * @param privateKey - Private key from command line argument
 * @param useDefaultAnvilKey - Whether to use Anvil's default key if no key provided
 * @returns Wallet instance
 * @throws {Error} If no private key is provided and useDefaultAnvilKey is false
 */
function getDeployerWallet(privateKey?: string, useDefaultAnvilKey: boolean = false): ethers.Wallet {
  const key = privateKey || process.env.DEPLOYER_PRIVATE_KEY || (useDefaultAnvilKey ? ANVIL_DEFAULT_PRIVATE_KEY : undefined);
  
  if (!key) {
    throw new Error(
      'Deployer private key is required.\n' +
      '  Provide it as: DEPLOYER_PRIVATE_KEY env var, or\n' +
      '  Pass it as the third argument: <rpc-url> <house-address> <deployer-private-key>, or\n' +
      '  Use --default-anvil-key flag for local Anvil development'
    );
  }
  
  return new ethers.Wallet(key);
}

/**
 * Gets the compiled contract artifact
 *
 * @param contractName - Name of the contract (e.g., "CloutCards")
 * @returns Contract artifact with ABI and bytecode
 */
function getContractArtifact(contractName: string): { abi: any[]; bytecode: string } {
  try {
    // Try to read from Foundry output
    const artifactPath = join(__dirname, '../onchain/out', `${contractName}.sol`, `${contractName}.json`);
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    return {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
    };
  } catch (error) {
    throw new Error(
      `Failed to load contract artifact. Make sure to compile the contract first:\n` +
        `  cd onchain && forge build`
    );
  }
}

/**
 * Deploys the CloutCards implementation contract
 *
 * @param wallet - Deployer wallet
 * @returns Deployed contract instance
 */
async function deployImplementation(wallet: ethers.Wallet): Promise<{ contract: ethers.BaseContract; usedNonce: number }> {
  console.log('📦 Deploying CloutCards implementation contract...');
  
  const artifact = getContractArtifact('CloutCards');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  // Get current nonce
  if (!wallet.provider) {
    throw new Error('Wallet provider is required for deployment');
  }
  const nonce = await wallet.provider.getTransactionCount(wallet.address, 'pending');
  console.log(`   Using nonce: ${nonce}`);
  
  // Deploy with explicit nonce
  const deployTx = await factory.getDeployTransaction();
  deployTx.nonce = nonce;
  
  console.log(`   Sending deployment transaction with nonce: ${nonce}`);
  const txResponse = await wallet.sendTransaction(deployTx);
  console.log(`   Transaction hash: ${txResponse.hash}`);
  console.log('   Waiting for deployment...');
  
  // Wait for transaction to be fully confirmed (not just mined)
  const receipt = await txResponse.wait();
  if (!receipt) {
    throw new Error('Transaction receipt is null');
  }
  
  // Get contract address from receipt
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error('Contract address not found in receipt');
  }
  
  const contract = new ethers.Contract(contractAddress, artifact.abi, wallet);
  
  console.log(`✅ Implementation deployed at: ${contractAddress}`);
  return { contract, usedNonce: nonce };
}

/**
 * Deploys a UUPS proxy pointing to the implementation
 *
 * @param wallet - Deployer wallet
 * @param implementationAddress - Address of the implementation contract
 * @param initialOwner - Address that will own the contract
 * @param houseAddress - TEE house address
 * @returns Deployed proxy contract instance
 */
async function deployProxy(
  wallet: ethers.Wallet,
  implementationAddress: string,
  initialOwner: string,
  houseAddress: string
): Promise<ethers.Contract> {
  console.log('📦 Deploying UUPS proxy...');
  
  const proxyArtifact = getUUPSProxyArtifact();
  const implementationArtifact = getContractArtifact('CloutCards');
  
  // Encode the initialize function call
  const iface = new ethers.Interface(implementationArtifact.abi);
  const initData = iface.encodeFunctionData('initialize', [initialOwner, houseAddress]);
  
  // Deploy proxy using OpenZeppelin's UUPSProxy
  // UUPSProxy constructor: constructor(address _implementation, bytes memory _data)
  const proxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, wallet);
  
  console.log(`   Implementation: ${implementationAddress}`);
  console.log(`   Initializing with:`);
  console.log(`     Owner: ${initialOwner}`);
  console.log(`     House: ${houseAddress}`);
  
  // Get fresh nonce after implementation deployment is confirmed
  // Use 'latest' to ensure we get the nonce after the implementation transaction
  if (!wallet.provider) {
    throw new Error('Wallet provider is required for deployment');
  }
  const nonce = await wallet.provider.getTransactionCount(wallet.address, 'latest');
  console.log(`   Using nonce: ${nonce}`);
  
  // Deploy with explicit nonce
  const deployTx = await proxyFactory.getDeployTransaction(implementationAddress, initData);
  deployTx.nonce = nonce;
  
  console.log(`   Sending proxy deployment transaction with nonce: ${nonce}`);
  const txResponse = await wallet.sendTransaction(deployTx);
  console.log(`   Transaction hash: ${txResponse.hash}`);
  console.log('   Waiting for deployment...');
  
  // Wait for transaction to be fully confirmed
  const receipt = await txResponse.wait();
  if (!receipt) {
    throw new Error('Transaction receipt is null');
  }
  
  // Check if transaction succeeded
  if (receipt.status !== 1) {
    throw new Error(`Proxy deployment transaction failed with status: ${receipt.status}`);
  }
  
  // Get contract address from receipt
  const proxyAddress = receipt.contractAddress;
  if (!proxyAddress) {
    throw new Error('Proxy address not found in receipt');
  }
  
  console.log(`✅ Proxy deployed at: ${proxyAddress}`);
  
  // Wait a bit for contract state to be available (some networks need time to index)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Return the proxy contract with the implementation ABI (since proxy delegates calls)
  const proxyContract = new ethers.Contract(proxyAddress, implementationArtifact.abi, wallet);
  
  // Verify initialization succeeded by checking if owner() call works
  try {
    const owner = await proxyContract.owner({ blockTag: receipt.blockNumber });
    if (!owner || owner === ethers.ZeroAddress) {
      throw new Error('Proxy initialization appears to have failed - owner is zero address');
    }
    console.log(`   Verified initialization: owner = ${owner}`);
  } catch (error: any) {
    // If the call fails, it might be a timing issue - try once more with latest block
    try {
      const owner = await proxyContract.owner();
      if (!owner || owner === ethers.ZeroAddress) {
        throw new Error('Proxy initialization appears to have failed - owner is zero address');
      }
      console.log(`   Verified initialization: owner = ${owner}`);
    } catch (retryError: any) {
      console.error('⚠️  Warning: Could not verify proxy initialization immediately.');
      console.error('   This might be a timing issue. The proxy was deployed successfully.');
      console.error('   Please verify manually by calling owner() on the proxy contract.');
      console.error(`   Error: ${retryError.message}`);
      // Don't throw - deployment succeeded, verification just failed
    }
  }
  
  return proxyContract;
}

/**
 * Upgrades an existing proxy to a new implementation
 *
 * @param wallet - Deployer wallet (must be owner)
 * @param proxyAddress - Address of the existing proxy
 * @param newImplementationAddress - Address of the new implementation
 */
async function upgradeProxy(
  wallet: ethers.Wallet,
  proxyAddress: string,
  newImplementationAddress: string
): Promise<void> {
  console.log('🔄 Upgrading proxy...');
  console.log(`   Proxy: ${proxyAddress}`);
  console.log(`   New implementation: ${newImplementationAddress}`);
  
  const artifact = getContractArtifact('CloutCards');
  const proxy = new ethers.Contract(proxyAddress, artifact.abi, wallet);
  
  // UUPS proxies use upgradeToAndCall - pass empty data for no initialization call
  const tx = await proxy.upgradeToAndCall(newImplementationAddress, '0x');
  console.log(`   Transaction hash: ${tx.hash}`);
  console.log('   Waiting for upgrade...');
  
  await tx.wait();
  console.log(`✅ Proxy upgraded successfully`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const upgradeIndex = args.indexOf('--upgrade');
  const isUpgrade = upgradeIndex !== -1;
  const defaultAnvilKeyIndex = args.indexOf('--default-anvil-key');
  const useDefaultAnvilKey = defaultAnvilKeyIndex !== -1;
  const skipConfirmationIndex = args.indexOf('--skip-confirmation');
  const skipConfirmation = skipConfirmationIndex !== -1;
  
  // Extract upgrade proxy address before removing flags
  let upgradeProxyAddress: string | undefined;
  if (isUpgrade && upgradeIndex + 1 < args.length) {
    upgradeProxyAddress = args[upgradeIndex + 1];
  }
  
  // Remove flags from args array (remove in reverse order to preserve indices)
  // Note: --upgrade flag also removes its value (the next argument)
  const indicesToRemove: number[] = [];
  if (skipConfirmationIndex !== -1) indicesToRemove.push(skipConfirmationIndex);
  if (defaultAnvilKeyIndex !== -1) indicesToRemove.push(defaultAnvilKeyIndex);
  if (upgradeIndex !== -1) {
    indicesToRemove.push(upgradeIndex);
    // Also remove the proxy address argument after --upgrade
    if (upgradeIndex + 1 < args.length) {
      indicesToRemove.push(upgradeIndex + 1);
    }
  }
  
  // Sort descending and remove
  indicesToRemove.sort((a, b) => b - a);
  for (const idx of indicesToRemove) {
    args.splice(idx, 1);
  }
  
  if (args.length < 2) {
    console.error('Usage: npx ts-node scripts/deploy-clout-cards.ts <rpc-url> <house-address> [deployer-private-key] [--upgrade <proxy-address>] [--default-anvil-key] [--skip-confirmation]');
    console.error('');
    console.error('Arguments:');
    console.error('  rpc-url              - RPC URL for the network (e.g., http://localhost:8545)');
    console.error('  house-address        - TEE house address (from /tee/publicKey endpoint)');
    console.error('  deployer-private-key - Optional private key (defaults to DEPLOYER_PRIVATE_KEY env var)');
    console.error('');
    console.error('Options:');
    console.error('  --upgrade <proxy-address>  - Upgrade existing proxy instead of deploying new');
    console.error('  --default-anvil-key         - Use Anvil\'s default private key (for local development only)');
    console.error('  --skip-confirmation         - Skip confirmation prompt when using --default-anvil-key');
    console.error('');
    console.error('Examples:');
    console.error('  # Deploy new contract');
    console.error('  npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd');
    console.error('');
    console.error('  # Deploy with Anvil default key (local dev only)');
    console.error('  npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd --default-anvil-key');
    console.error('');
    console.error('  # Deploy with Anvil default key (skip confirmation)');
    console.error('  npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd --default-anvil-key --skip-confirmation');
    console.error('');
    console.error('  # Upgrade existing contract');
    console.error('  npx ts-node scripts/deploy-clout-cards.ts http://localhost:8545 0x1234...abcd 0xYOUR_KEY --upgrade 0xPROXY_ADDRESS');
    process.exit(1);
  }
  
  const rpcUrl = args[0];
  const houseAddress = args[1];
  const deployerPrivateKey = args[2];
  
  // Validate house address
  if (!ethers.isAddress(houseAddress)) {
    console.error(`Error: Invalid house address: ${houseAddress}`);
    process.exit(1);
  }
  
  // Confirm if using default Anvil key (unless skip confirmation flag is set)
  if (useDefaultAnvilKey && !skipConfirmation) {
    const confirmed = await confirmDefaultAnvilKey();
    if (!confirmed) {
      console.log('Deployment cancelled.');
      process.exit(0);
    }
  } else if (useDefaultAnvilKey && skipConfirmation) {
    console.warn('⚠️  WARNING: Using Anvil\'s default private key (confirmation skipped via --skip-confirmation flag).');
    console.warn('   This should ONLY be used for local development!');
  }
  
  // Get deployer wallet
  const deployerWallet = getDeployerWallet(deployerPrivateKey, useDefaultAnvilKey);
  const deployerAddress = deployerWallet.address;
  
  // Connect to network
  console.log(`🔗 Connecting to network: ${rpcUrl}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = deployerWallet.connect(provider);
  
  // Check balance
  const balance = await provider.getBalance(deployerAddress);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.error('Error: Deployer has zero balance. Please fund the deployer address.');
    process.exit(1);
  }
  
  // Get current nonce from network to ensure it's in sync
  const currentNonce = await provider.getTransactionCount(deployerAddress, 'pending');
  console.log(`🔢 Current nonce: ${currentNonce}`);
  
  // Get network info
  const network = await provider.getNetwork();
  console.log(`🌐 Network: Chain ID ${network.chainId}`);
  console.log(`👤 Deployer: ${deployerAddress}`);
  console.log(`🏠 House address: ${houseAddress}`);
  console.log('');
  
  if (isUpgrade) {
    const proxyAddress = upgradeProxyAddress;
    if (!proxyAddress || !ethers.isAddress(proxyAddress)) {
      console.error('Error: Invalid proxy address for upgrade');
      process.exit(1);
    }
    
    // Deploy new implementation
    const { contract: newImplementation } = await deployImplementation(wallet);
    const newImplementationAddress = await newImplementation.getAddress();
    
    console.log('');
    
    // Upgrade proxy
    await upgradeProxy(wallet, proxyAddress, newImplementationAddress);
    
    console.log('');
    console.log('✅ Upgrade complete!');
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   New implementation: ${newImplementationAddress}`);
  } else {
    // Deploy new contract
    const { contract: implementation, usedNonce: implNonce } = await deployImplementation(wallet);
    const implementationAddress = await implementation.getAddress();
    
    console.log('');
    
    // Ensure implementation transaction is fully confirmed before deploying proxy
    // Wait for the transaction to be fully confirmed and nonce to increment
    if (!wallet.provider) {
      throw new Error('Wallet provider is required');
    }
    
    // Poll until nonce has incremented (with timeout)
    const expectedNonce = implNonce + 1;
    let latestNonce = await wallet.provider.getTransactionCount(deployerAddress, 'latest');
    let attempts = 0;
    const maxAttempts = 20; // Increase attempts for slower networks
    
    while (latestNonce < expectedNonce && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      latestNonce = await wallet.provider.getTransactionCount(deployerAddress, 'latest');
      attempts++;
      if (attempts % 5 === 0) {
        console.log(`   Waiting for nonce to increment... (current: ${latestNonce}, expected: ${expectedNonce})`);
      }
    }
    
    if (latestNonce < expectedNonce) {
      throw new Error(`Nonce did not increment after implementation deployment. Expected: ${expectedNonce}, Got: ${latestNonce}`);
    }
    
    console.log(`   Latest nonce after implementation: ${latestNonce}`);
    
    // Deploy proxy and initialize
    const proxy = await deployProxy(wallet, implementationAddress, deployerAddress, houseAddress);
    const proxyAddress = await proxy.getAddress();
    
    // Verify initialization (with retry logic for timing issues)
    let owner: string;
    let house: string;
    let retries = 3;
    let lastError: Error | null = null;
    
    while (retries > 0) {
      try {
        owner = await proxy.owner();
        house = await proxy.house();
        if (owner && owner !== ethers.ZeroAddress && house && house !== ethers.ZeroAddress) {
          break; // Success
        }
        throw new Error('Owner or house address is zero');
      } catch (error: any) {
        lastError = error;
        retries--;
        if (retries > 0) {
          console.log(`   Retrying verification (${retries} attempts remaining)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!owner || !house) {
      throw new Error(`Failed to verify proxy initialization after retries. Last error: ${lastError?.message || 'Unknown'}`);
    }
    
    console.log('');
    console.log('✅ Deployment complete!');
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Owner: ${owner}`);
    console.log(`   House: ${house}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log(`   1. Verify the contract on block explorer`);
    console.log(`   2. Set the proxy address as the CloutCards contract address`);
    console.log(`   3. Use proxy address (${proxyAddress}) for all interactions`);
  }
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

