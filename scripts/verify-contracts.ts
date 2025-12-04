/**
 * Contract verification script for Etherscan/Basescan
 *
 * Verifies both the implementation and proxy contracts on Etherscan/Basescan.
 * Uses the Etherscan API which is compatible with Basescan for Base networks.
 *
 * Usage:
 *   npx ts-node scripts/verify-contracts.ts <api-url> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>
 *
 * Example for Base Sepolia:
 *   npx ts-node scripts/verify-contracts.ts https://api-sepolia.basescan.org/api YOUR_API_KEY 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e 0xCC4A81f07d9E925e90873349c903E3FE93099b0a 0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76
 *
 * API URLs:
 *   - Base Sepolia: https://api-sepolia.basescan.org/api
 *   - Base Mainnet: https://api.basescan.org/api
 *   - Ethereum Sepolia: https://api-sepolia.etherscan.io/api
 *   - Ethereum Mainnet: https://api.etherscan.io/api
 *
 * Note: This script uses the standard-json-input format which requires flattening.
 * For easier verification, consider using Foundry's built-in verification:
 *   cd onchain && forge verify-contract <address> src/CloutCards.sol:CloutCards --chain-id 84532 --etherscan-api-key <key>
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ethers } from 'ethers';

const args = process.argv.slice(2);

if (args.length < 6) {
  console.error('Usage: npx ts-node scripts/verify-contracts.ts <api-url> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>');
  console.error('');
  console.error('Example:');
  console.error('  npx ts-node scripts/verify-contracts.ts https://api-sepolia.basescan.org/api YOUR_API_KEY 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e 0xCC4A81f07d9E925e90873349c903E3FE93099b0a 0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76');
  process.exit(1);
}

const [apiUrl, apiKey, implementationAddress, proxyAddress, ownerAddress, houseAddress] = args;

// Validate addresses
if (!ethers.isAddress(implementationAddress) || !ethers.isAddress(proxyAddress) || 
    !ethers.isAddress(ownerAddress) || !ethers.isAddress(houseAddress)) {
  console.error('Error: All addresses must be valid Ethereum addresses');
  process.exit(1);
}

/**
 * Gets compiler version - default to 0.8.22 based on pragma
 */
function getCompilerVersion(): string {
  return 'v0.8.22+commit.4fc1097e'; // Common Solidity 0.8.22 version string
}

/**
 * Encodes constructor arguments for the proxy
 * ERC1967Proxy constructor: constructor(address _implementation, bytes memory _data)
 */
function encodeProxyConstructorArgs(implementationAddress: string, ownerAddress: string, houseAddress: string): string {
  // Get the implementation ABI to encode the initialize function
  const artifactPath = join(__dirname, '../onchain/out/CloutCards.sol/CloutCards.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const iface = new ethers.Interface(artifact.abi);
  
  // Encode the initialize function call
  const initData = iface.encodeFunctionData('initialize', [ownerAddress, houseAddress]);
  
  // ABI encode the constructor arguments: (address, bytes)
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'bytes'],
    [implementationAddress, initData]
  );
  
  // Remove the '0x' prefix for Etherscan API
  return encoded.slice(2);
}

/**
 * Verifies a contract on Etherscan/Basescan using standard-json-input
 */
async function verifyContract(
  apiUrl: string,
  apiKey: string,
  contractAddress: string,
  contractName: string,
  sourceCode: string,
  constructorArgs: string = '',
  isProxy: boolean = false
): Promise<string> {
  console.log(`\n📦 Verifying ${contractName} at ${contractAddress}...`);
  
  const compilerVersion = getCompilerVersion();
  const contractPath = isProxy 
    ? '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy'
    : `src/CloutCards.sol:CloutCards`;
  
  // For standard-json-input, we need to create a JSON with all sources
  // This is simplified - in practice you'd need to include all imported contracts
  const standardJsonInput = {
    language: 'Solidity',
    sources: {
      [contractPath]: {
        content: sourceCode
      }
    },
    settings: {
      optimizer: {
        enabled: false,
        runs: 200
      },
      evmVersion: 'default',
      viaIR: false,
      remappings: [
        '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/',
        '@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/'
      ]
    }
  };
  
  const params = new URLSearchParams({
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: contractAddress,
    codeformat: 'solidity-standard-json-input',
    contractname: contractPath,
    compilerversion: compilerVersion,
    optimizationUsed: '0',
    runs: '200',
    constructorArguements: constructorArgs, // Note: Etherscan API typo - "Arguements"
    evmVersion: 'default',
    licenseType: '3' // MIT
  });
  
  // Add sourceCode as a separate parameter
  params.append('sourceCode', JSON.stringify(standardJsonInput));
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    const data = await response.json();
    
    if (data.status === '1' && data.message === 'OK') {
      console.log(`✅ Verification submitted successfully!`);
      console.log(`   GUID: ${data.result}`);
      const baseUrl = apiUrl.replace('/api', '');
      console.log(`   Check status: ${baseUrl}/api?module=contract&action=checkverifystatus&apikey=${apiKey}&guid=${data.result}`);
      return data.result;
    } else {
      console.error(`❌ Verification failed: ${data.message}`);
      if (data.result) {
        console.error(`   Details: ${JSON.stringify(data.result, null, 2)}`);
      }
      throw new Error(`Verification failed: ${data.message}`);
    }
  } catch (error: any) {
    console.error(`❌ Error submitting verification: ${error.message}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Contract Verification Script');
  console.log('==============================');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Implementation: ${implementationAddress}`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`Owner: ${ownerAddress}`);
  console.log(`House: ${houseAddress}`);
  console.log('\n⚠️  Note: Standard-json-input format requires all imported contracts.');
  console.log('   For easier verification, consider using Foundry\'s built-in command:');
  console.log('   cd onchain && forge verify-contract <address> src/CloutCards.sol:CloutCards --chain-id 84532 --etherscan-api-key <key>');
  console.log('');
  
  try {
    // Get source codes
    const implementationSource = readFileSync(join(__dirname, '../onchain/src/CloutCards.sol'), 'utf-8');
    const proxySource = readFileSync(join(__dirname, '../onchain/lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol'), 'utf-8');
    
    // Verify implementation contract (no constructor args)
    console.log('\n1️⃣  Verifying Implementation Contract...');
    await verifyContract(
      apiUrl,
      apiKey,
      implementationAddress,
      'CloutCards',
      implementationSource,
      '', // No constructor args for implementation
      false
    );
    
    // Wait between requests
    console.log('\n⏳ Waiting 3 seconds before next verification...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify proxy contract (with constructor args)
    console.log('\n2️⃣  Verifying Proxy Contract...');
    const constructorArgs = encodeProxyConstructorArgs(implementationAddress, ownerAddress, houseAddress);
    await verifyContract(
      apiUrl,
      apiKey,
      proxyAddress,
      'ERC1967Proxy',
      proxySource,
      constructorArgs,
      true
    );
    
    console.log('\n✅ All verifications submitted!');
    console.log('   Please check the status using the GUIDs above.');
    console.log('   Verification typically takes 30-60 seconds.');
    console.log('\n💡 Tip: You can also verify using Foundry:');
    console.log(`   cd onchain && forge verify-contract ${implementationAddress} src/CloutCards.sol:CloutCards --chain-id 84532 --etherscan-api-key ${apiKey}`);
    
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('\n💡 Alternative: Use Foundry\'s built-in verification which handles imports automatically:');
    console.error(`   cd onchain && forge verify-contract ${implementationAddress} src/CloutCards.sol:CloutCards --chain-id 84532 --etherscan-api-key ${apiKey}`);
    process.exit(1);
  }
}

main();
