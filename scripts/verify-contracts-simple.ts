/**
 * Simplified contract verification script using flattened source code
 *
 * This script uses Foundry's flatten command to create single-file source code
 * which is easier to verify on Etherscan/Basescan.
 *
 * Note: Basescan uses Etherscan API V2. This script uses the V1 format which
 * may be deprecated. For Base networks, consider using Foundry's built-in
 * verification command instead.
 *
 * Usage:
 *   npx ts-node scripts/verify-contracts-simple.ts <api-url> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>
 *
 * Example for Base Sepolia:
 *   npx ts-node scripts/verify-contracts-simple.ts https://api-sepolia.basescan.org/api YOUR_API_KEY 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e 0xCC4A81f07d9E925e90873349c903E3FE93099b0a 0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76
 *
 * Alternative: Use Foundry's built-in verification:
 *   cd onchain && forge verify-contract <address> src/CloutCards.sol:CloutCards --chain-id 84532 --etherscan-api-key <key>
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { ethers } from 'ethers';

const args = process.argv.slice(2);

if (args.length < 6) {
  console.error('Usage: npx ts-node scripts/verify-contracts-simple.ts <api-url> <api-key> <implementation-address> <proxy-address> <owner-address> <house-address>');
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
 * Flattens a contract using Foundry
 */
function flattenContract(contractPath: string): string {
  const onchainDir = join(__dirname, '../onchain');
  try {
    const output = execSync(`cd ${onchainDir} && forge flatten ${contractPath}`, { encoding: 'utf-8' });
    return output;
  } catch (error: any) {
    throw new Error(`Failed to flatten contract: ${error.message}`);
  }
}

/**
 * Encodes constructor arguments for the proxy
 */
function encodeProxyConstructorArgs(implementationAddress: string, ownerAddress: string, houseAddress: string): string {
  const artifactPath = join(__dirname, '../onchain/out/CloutCards.sol/CloutCards.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const iface = new ethers.Interface(artifact.abi);
  
  const initData = iface.encodeFunctionData('initialize', [ownerAddress, houseAddress]);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'bytes'],
    [implementationAddress, initData]
  );
  
  return encoded.slice(2); // Remove '0x'
}

/**
 * Verifies a contract using single-file format
 * Uses Etherscan API V1 format (still supported by Basescan)
 */
async function verifyContract(
  apiUrl: string,
  apiKey: string,
  contractAddress: string,
  contractName: string,
  sourceCode: string,
  constructorArgs: string = '',
  compilerVersion: string = 'v0.8.22+commit.4fc1097e'
): Promise<string> {
  console.log(`\n📦 Verifying ${contractName} at ${contractAddress}...`);
  
  const contractPath = contractName === 'CloutCards' 
    ? 'src/CloutCards.sol:CloutCards'
    : '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy';
  
  // Build form data for POST request (V1 API format)
  const formData = new URLSearchParams();
  formData.append('apikey', apiKey);
  formData.append('module', 'contract');
  formData.append('action', 'verifysourcecode');
  formData.append('contractaddress', contractAddress);
  formData.append('codeformat', 'solidity-single-file');
  formData.append('contractname', contractPath);
  formData.append('compilerversion', compilerVersion);
  formData.append('optimizationUsed', '0');
  formData.append('runs', '200');
  if (constructorArgs) {
    formData.append('constructorArguements', constructorArgs); // Etherscan API typo
  }
  formData.append('evmVersion', 'default');
  formData.append('licenseType', '3'); // MIT
  formData.append('sourceCode', sourceCode);
  
  // Try V1 API first, then fall back if needed
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    
    const data: any = await response.json();
    
    if (data.status === '1' && data.message === 'OK') {
      console.log(`✅ Verification submitted successfully!`);
      console.log(`   GUID: ${data.result}`);
      const baseUrl = apiUrl.replace('/api', '');
      console.log(`   Check status: ${baseUrl}/api?module=contract&action=checkverifystatus&apikey=${apiKey}&guid=${data.result}`);
      return data.result;
    } else if (data.message && data.message.includes('deprecated') || data.message && data.message.includes('V2')) {
      // If V1 is deprecated, try using the proxy verification endpoint for proxy contracts
      // For implementation, we might need to use a different approach
      console.warn(`⚠️  V1 API deprecated. Trying alternative approach...`);
      console.warn(`   Note: Basescan may require manual verification via their UI.`);
      console.warn(`   Implementation: ${apiUrl.replace('/api', '')}/address/${contractAddress}#code`);
      console.warn(`   Proxy: ${apiUrl.replace('/api', '')}/address/${proxyAddress}#code`);
      throw new Error('V1 API deprecated - please verify manually via Basescan UI or use Foundry verify-contract command');
    } else {
      console.error(`❌ Verification failed: ${data.message}`);
      if (data.result) {
        console.error(`   Details: ${JSON.stringify(data.result, null, 2)}`);
      }
      throw new Error(`Verification failed: ${data.message}`);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🔍 Contract Verification Script (Simplified)');
  console.log('============================================');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Implementation: ${implementationAddress}`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`Owner: ${ownerAddress}`);
  console.log(`House: ${houseAddress}`);
  
  try {
    // Flatten contracts
    console.log('\n📄 Flattening contracts...');
    console.log('   Flattening CloutCards.sol...');
    const implementationSource = flattenContract('src/CloutCards.sol');
    
    console.log('   Flattening ERC1967Proxy.sol...');
    const proxySource = flattenContract('lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol');
    
    // Verify implementation
    console.log('\n1️⃣  Verifying Implementation Contract...');
    await verifyContract(
      apiUrl,
      apiKey,
      implementationAddress,
      'CloutCards',
      implementationSource,
      '' // No constructor args
    );
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify proxy
    console.log('\n2️⃣  Verifying Proxy Contract...');
    const constructorArgs = encodeProxyConstructorArgs(implementationAddress, ownerAddress, houseAddress);
    await verifyContract(
      apiUrl,
      apiKey,
      proxyAddress,
      'ERC1967Proxy',
      proxySource,
      constructorArgs
    );
    
    console.log('\n✅ All verifications submitted!');
    console.log('   Check the GUIDs above for verification status.');
    
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

main();

