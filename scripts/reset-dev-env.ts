/**
 * Reset development environment script
 *
 * This script tears down and restarts the entire development environment:
 * 1. Stops and removes Docker containers and volumes
 * 2. Starts Docker containers (PostgreSQL and Anvil)
 * 3. Waits for services to be ready
 * 4. Runs database migrations
 * 5. Deploys the CloutCards contract
 * 6. Displays the contract proxy address
 *
 * Usage:
 *   npx ts-node scripts/reset-dev-env.ts
 *
 * Prerequisites:
 *   - Docker and Docker Compose installed
 *   - Backend dependencies installed (npm install)
 *   - Foundry/Forge installed (for contract compilation)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const BACKEND_URL = 'http://localhost:8000';
const RPC_URL = 'http://localhost:8545';
const TEE_PUBLIC_KEY_FALLBACK = '0x0487Ecf457cEAdc4Be25676EDE5F634fdcDdbF4d';

/**
 * Executes a shell command and returns the output
 */
function exec(command: string, options?: { cwd?: string; stdio?: 'inherit' | 'pipe' }): string {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: options?.stdio || 'pipe',
      cwd: options?.cwd,
    });
    // When stdio is 'inherit', execSync returns null
    return result ? result.trim() : '';
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

/**
 * Waits for a service to be ready by checking health endpoint
 */
function waitForService(name: string, checkFn: () => boolean, timeout = 30000): void {
  console.log(`⏳ Waiting for ${name} to be ready...`);
  const startTime = Date.now();
  const interval = 1000; // Check every second

  while (Date.now() - startTime < timeout) {
    try {
      if (checkFn()) {
        console.log(`✅ ${name} is ready`);
        return;
      }
    } catch (error) {
      // Service not ready yet, continue waiting
    }
    // Wait before next check using setTimeout wrapped in a promise
    const waitTime = Math.min(interval, timeout - (Date.now() - startTime));
    if (waitTime > 0) {
      // Use a simple busy-wait for short intervals (Node.js doesn't have sleep)
      const waitUntil = Date.now() + waitTime;
      while (Date.now() < waitUntil) {
        // Busy wait
      }
    }
  }

  throw new Error(`${name} did not become ready within ${timeout}ms`);
}

/**
 * Checks if PostgreSQL is ready
 */
function checkPostgresReady(): boolean {
  try {
    execSync('docker exec clout-cards-postgres pg_isready -U cloutcards', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if Anvil is ready
 */
function checkAnvilReady(): boolean {
  try {
    const response = execSync(`curl -s -X POST ${RPC_URL} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return response.includes('result');
  } catch {
    return false;
  }
}

/**
 * Gets TEE public key from backend API
 */
function getTeePublicKey(): string {
  try {
    console.log('🔑 Fetching TEE public key from backend...');
    const response = execSync(`curl -s ${BACKEND_URL}/tee/publicKey`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const data = JSON.parse(response);
    if (data.publicKey) {
      console.log(`✅ TEE public key: ${data.publicKey}`);
      return data.publicKey;
    }
  } catch (error) {
    console.log(`⚠️  Could not fetch TEE public key from backend: ${error}`);
    console.log(`   Using fallback: ${TEE_PUBLIC_KEY_FALLBACK}`);
  }
  return TEE_PUBLIC_KEY_FALLBACK;
}

/**
 * Extracts proxy address from deploy script output
 */
function extractProxyAddress(output: string): string | null {
  // Look for "✅ Proxy deployed at: 0x..." pattern
  const proxyMatch = output.match(/✅ Proxy deployed at:\s*(0x[a-fA-F0-9]{40})/i);
  if (proxyMatch) {
    return proxyMatch[1];
  }

  // Also check for "Proxy: 0x..." pattern (from deployment summary)
  const summaryMatch = output.match(/Proxy:\s*(0x[a-fA-F0-9]{40})/i);
  if (summaryMatch) {
    return summaryMatch[1];
  }

  // Fallback: look for any "Proxy" followed by address
  const fallbackMatch = output.match(/Proxy.*?(0x[a-fA-F0-9]{40})/i);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }

  return null;
}

async function main() {
  console.log('🔄 Resetting development environment...\n');

  // Step 1: Tear down Docker containers and volumes
  console.log('📦 Step 1: Tearing down Docker containers and volumes...');
  try {
    execSync('docker-compose down -v', { stdio: 'inherit' });
    console.log('✅ Docker containers and volumes removed\n');
  } catch (error: any) {
    // Ignore errors - containers may not exist
    if (error.status !== 0) {
      console.log('⚠️  Note: Some containers may not have existed\n');
    } else {
      console.log('✅ Docker containers and volumes removed\n');
    }
  }

  // Step 2: Start Docker containers
  console.log('📦 Step 2: Starting Docker containers...');
  execSync('docker-compose up -d', { stdio: 'inherit' });
  console.log('✅ Docker containers started\n');

  // Step 3: Wait for services to be ready
  console.log('⏳ Step 3: Waiting for services to be ready...');
  waitForService('PostgreSQL', checkPostgresReady);
  waitForService('Anvil', checkAnvilReady);
  console.log('');

  // Step 4: Run database migrations
  console.log('🗄️  Step 4: Running database migrations...');
  execSync('export IS_LOCAL=true &&npx prisma migrate dev --name reset_dev_env', { stdio: 'inherit' });
  console.log('✅ Database migrations completed\n');

  // Step 5: Get TEE public key
  console.log('🔑 Step 5: Getting TEE public key...');
  const teePublicKey = getTeePublicKey();
  console.log('');

  // Step 6: Deploy contract
  console.log('📝 Step 6: Deploying CloutCards contract...');
  console.log(`   RPC URL: ${RPC_URL}`);
  console.log(`   House address: ${teePublicKey}\n`);

  const deployOutput = exec(
    `npx ts-node scripts/deploy-clout-cards.ts ${RPC_URL} ${teePublicKey} --default-anvil-key --skip-confirmation`,
    { stdio: 'pipe' }
  );

  console.log(deployOutput);

  // Extract and display proxy address
  const proxyAddress = extractProxyAddress(deployOutput);
  if (proxyAddress) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ DEPLOYMENT COMPLETE');
    console.log('='.repeat(60));
    console.log(`📋 Contract Proxy Address: ${proxyAddress}`);
    console.log('');
    console.log('To start the dev server with this contract address:');
    console.log(`  export IS_LOCAL=true`);
    console.log(`  export CLOUTCARDS_CONTRACT_ADDRESS=${proxyAddress}`);
    console.log(`  npm run dev:full`);
    console.log('');
    console.log('Or add to .env file:');
    console.log(`  echo "IS_LOCAL=true" >> .env`);
    console.log(`  echo "CLOUTCARDS_CONTRACT_ADDRESS=${proxyAddress}" >> .env`);
    console.log('='.repeat(60));
  } else {
    console.log('\n⚠️  Could not extract proxy address from deployment output.');
    console.log('   Please check the output above for the proxy address.');
  }
}

main().catch((error) => {
  console.error('\n❌ Error resetting development environment:', error);
  process.exit(1);
});

