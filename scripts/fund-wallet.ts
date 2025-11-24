/**
 * Script to fund a wallet with ETH from Anvil's default account
 *
 * This script sends ETH from Anvil's first pre-funded account (the default deployer)
 * to any specified address. Useful for funding test wallets during development.
 *
 * Usage:
 *   npx ts-node scripts/fund-wallet.ts <recipient-address> <amount-in-eth>
 *
 * Example:
 *   npx ts-node scripts/fund-wallet.ts 0x1234...abcd 10
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Anvil's default account (pre-funded with 10,000 ETH)
 * Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 */
const ANVIL_DEFAULT_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/**
 * Anvil RPC URL (default)
 */
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://localhost:8545';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx ts-node scripts/fund-wallet.ts <recipient-address> [amount-in-eth]');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node scripts/fund-wallet.ts 0x1234...abcd');
    console.error('  npx ts-node scripts/fund-wallet.ts 0x1234...abcd 10');
    console.error('');
    console.error('If amount is not specified, defaults to 10 ETH');
    process.exit(1);
  }

  const recipientAddress = args[0];
  const amountEth = args[1] ? parseFloat(args[1]) : 10;

  // Validate recipient address
  if (!ethers.isAddress(recipientAddress)) {
    console.error(`Error: Invalid address: ${recipientAddress}`);
    process.exit(1);
  }

  // Validate amount
  if (isNaN(amountEth) || amountEth <= 0) {
    console.error(`Error: Invalid amount: ${amountEth}. Must be a positive number.`);
    process.exit(1);
  }

  // Connect to Anvil
  const provider = new ethers.JsonRpcProvider(ANVIL_RPC_URL);
  const wallet = new ethers.Wallet(ANVIL_DEFAULT_PRIVATE_KEY, provider);

  console.log('Funding wallet...');
  console.log(`  From: ${wallet.address}`);
  console.log(`  To: ${recipientAddress}`);
  console.log(`  Amount: ${amountEth} ETH`);

  // Get balances before
  const senderBalanceBefore = await provider.getBalance(wallet.address);
  const recipientBalanceBefore = await provider.getBalance(recipientAddress);

  // Send transaction
  const amountWei = ethers.parseEther(amountEth.toString());
  const tx = await wallet.sendTransaction({
    to: recipientAddress,
    value: amountWei,
  });

  console.log(`\nTransaction sent: ${tx.hash}`);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();
  if (!receipt) {
    console.error('Error: Transaction receipt is null');
    process.exit(1);
  }

  // Get balances after
  const senderBalanceAfter = await provider.getBalance(wallet.address);
  const recipientBalanceAfter = await provider.getBalance(recipientAddress);

  console.log('\n✅ Transaction confirmed!');
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
  console.log(`\nBalances:`);
  console.log(`  Sender: ${ethers.formatEther(senderBalanceBefore)} ETH → ${ethers.formatEther(senderBalanceAfter)} ETH`);
  console.log(`  Recipient: ${ethers.formatEther(recipientBalanceBefore)} ETH → ${ethers.formatEther(recipientBalanceAfter)} ETH`);
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

