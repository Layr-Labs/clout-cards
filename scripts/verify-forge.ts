/**
 * Contract verification script using Foundry's forge verify-contract command
 *
 * This script uses Foundry's built-in verification which automatically handles
 * contract dependencies and source code flattening. It verifies both the
 * implementation and proxy contracts.
 *
 * Usage:
 *   npx ts-node scripts/verify-forge.ts <chain-id> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>
 *
 * Example for Base Sepolia:
 *   npx ts-node scripts/verify-forge.ts 84532 YOUR_API_KEY 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e 0xCC4A81f07d9E925e90873349c903E3FE93099b0a 0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76
 *
 * Chain IDs:
 *   - Base Sepolia: 84532
 *   - Base Mainnet: 8453
 *   - Ethereum Sepolia: 11155111
 *   - Ethereum Mainnet: 1
 *   - Local Anvil: 31337
 *
 * Prerequisites:
 *   - Contracts must be compiled: cd onchain && forge build
 *   - BASESCAN_API_KEY or ETHERSCAN_API_KEY environment variable must be set
 *     (or pass as argument)
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';
import { ethers } from 'ethers';

const args = process.argv.slice(2);

if (args.length < 6) {
  console.error('Usage: npx ts-node scripts/verify-forge.ts <chain-id> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>');
  console.error('');
  console.error('Example:');
  console.error('  npx ts-node scripts/verify-forge.ts 84532 YOUR_API_KEY 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e 0xCC4A81f07d9E925e90873349c903E3FE93099b0a 0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76');
  process.exit(1);
}

const [chainId, apiKey, implementationAddress, proxyAddress, ownerAddress, houseAddress] = args;

// Validate addresses
if (!ethers.isAddress(implementationAddress) || !ethers.isAddress(proxyAddress) || 
    !ethers.isAddress(ownerAddress) || !ethers.isAddress(houseAddress)) {
  console.error('Error: All addresses must be valid Ethereum addresses');
  process.exit(1);
}

// Validate chain ID
const chainIdNum = parseInt(chainId, 10);
if (isNaN(chainIdNum) || chainIdNum <= 0) {
  console.error(`Error: Invalid chain ID: ${chainId}`);
  process.exit(1);
}

const onchainDir = join(__dirname, '../onchain');

/**
 * Encodes constructor arguments for the proxy using cast
 * 
 * ERC1967Proxy constructor: constructor(address _implementation, bytes memory _data)
 * We need to encode: (implementationAddress, initializeCallData)
 *
 * @param implementationAddress - Address of the implementation contract
 * @param ownerAddress - Owner address for initialization
 * @param houseAddress - House address for initialization
 * @returns ABI-encoded constructor arguments as hex string
 */
function encodeProxyConstructorArgs(
  implementationAddress: string,
  ownerAddress: string,
  houseAddress: string
): string {
  // Get the implementation ABI to encode the initialize function
  const artifactPath = join(onchainDir, 'out/CloutCards.sol/CloutCards.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const iface = new ethers.Interface(artifact.abi);
  
  // Encode the initialize function call
  const initData = iface.encodeFunctionData('initialize', [ownerAddress, houseAddress]);
  
  // ABI encode the constructor arguments: (address, bytes)
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'bytes'],
    [implementationAddress, initData]
  );
  
  return encoded;
}

/**
 * Gets the compiler version from the compiled artifact
 *
 * @returns Compiler version string (e.g., "0.8.27+commit.40a35a09")
 */
function getCompilerVersion(): string {
  try {
    const artifactPath = join(onchainDir, 'out/CloutCards.sol/CloutCards.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    return artifact.metadata?.compiler?.version || '0.8.27+commit.40a35a09';
  } catch (error) {
    // Default fallback
    return '0.8.27+commit.40a35a09';
  }
}

/**
 * Runs forge verify-contract command
 *
 * @param contractAddress - Address of the contract to verify
 * @param contractPath - Path to the contract (e.g., "src/CloutCards.sol:CloutCards")
 * @param constructorArgs - ABI-encoded constructor arguments (optional)
 * @param compilerVersion - Compiler version (optional, will be auto-detected if not provided)
 * @returns Output from the verification command
 */
function verifyContract(
  contractAddress: string,
  contractPath: string,
  constructorArgs?: string,
  compilerVersion?: string
): string {
  const version = compilerVersion || getCompilerVersion();
  const baseCommand = `forge verify-contract ${contractAddress} ${contractPath} --chain-id ${chainId} --etherscan-api-key ${apiKey} --compiler-version ${version}`;
  const command = constructorArgs 
    ? `${baseCommand} --constructor-args ${constructorArgs.slice(2)}` // Remove 0x prefix
    : baseCommand;
  
  try {
    console.log(`\n📦 Running: cd ${onchainDir} && ${command}`);
    const output = execSync(command, { 
      cwd: onchainDir,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return output;
  } catch (error: any) {
    // Extract error message from stderr if available
    const errorMessage = error.stderr?.toString() || error.message || 'Unknown error';
    throw new Error(`Verification failed: ${errorMessage}`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Contract Verification Script (Using Foundry)');
  console.log('==============================================');
  console.log(`Chain ID: ${chainId}`);
  console.log(`Implementation: ${implementationAddress}`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`Owner: ${ownerAddress}`);
  console.log(`House: ${houseAddress}`);
  
  // Check if contracts are compiled
  const artifactPath = join(onchainDir, 'out/CloutCards.sol/CloutCards.json');
  try {
    readFileSync(artifactPath, 'utf-8');
  } catch (error) {
    console.error('\n❌ Error: Contracts not compiled.');
    console.error('   Please run: cd onchain && forge build');
    process.exit(1);
  }
  
  try {
    // Verify implementation contract (no constructor args)
    console.log('\n1️⃣  Verifying Implementation Contract...');
    const implOutput = verifyContract(
      implementationAddress,
      'src/CloutCards.sol:CloutCards'
    );
    console.log('✅ Implementation verification submitted!');
    console.log(implOutput);
    
    // Wait between requests to avoid rate limiting
    console.log('\n⏳ Waiting 3 seconds before next verification...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify proxy contract (with constructor args)
    console.log('\n2️⃣  Verifying Proxy Contract...');
    const constructorArgs = encodeProxyConstructorArgs(implementationAddress, ownerAddress, houseAddress);
    console.log(`   Constructor args (hex): ${constructorArgs}`);
    console.log(`   Args breakdown:`);
    console.log(`     - Implementation: ${implementationAddress}`);
    console.log(`     - Owner: ${ownerAddress}`);
    console.log(`     - House: ${houseAddress}`);
    
    const compilerVersion = getCompilerVersion();
    // Try direct path first (Foundry sometimes has issues with remapped paths for verification)
    let proxyOutput: string;
    try {
      proxyOutput = verifyContract(
        proxyAddress,
        'lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
        constructorArgs,
        compilerVersion
      );
    } catch (error: any) {
      // Fallback to remapped path if direct path fails
      console.log('   ⚠️  Direct path failed, trying remapped path...');
      proxyOutput = verifyContract(
        proxyAddress,
        '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
        constructorArgs,
        compilerVersion
      );
    }
    console.log('✅ Proxy verification submitted!');
    console.log(proxyOutput);
    
    console.log('\n✅ All verifications submitted!');
    console.log('   Verification typically takes 30-60 seconds.');
    console.log('   Check the block explorer for verification status.');
    
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Ensure contracts are compiled: cd onchain && forge build');
    console.error('   2. Check that the API key is valid for the chain');
    console.error('   3. Verify the addresses are correct');
    console.error('   4. Check that the contracts were deployed with the same compiler settings');
    process.exit(1);
  }
}

main();

