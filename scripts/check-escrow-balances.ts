import { prisma } from '../src/db/client';

async function checkBalances() {
  const balances = await prisma.playerEscrowBalance.findMany({
    orderBy: { walletAddress: 'asc' },
  });

  console.log(`\n📊 Found ${balances.length} escrow balance entries:\n`);
  
  for (const balance of balances) {
    const ethAmount = Number(balance.balanceGwei) / 1e9;
    console.log(`  Address: ${balance.walletAddress}`);
    console.log(`  Balance: ${balance.balanceGwei.toString()} gwei (${ethAmount} ETH)`);
    console.log(`  Updated: ${balance.updatedAt.toISOString()}`);
    console.log('');
  }

  // Check for case-insensitive duplicates
  const addresses = balances.map(b => b.walletAddress.toLowerCase());
  const uniqueAddresses = new Set(addresses);
  
  if (addresses.length !== uniqueAddresses.size) {
    console.log('⚠️  WARNING: Found duplicate addresses (case-insensitive):\n');
    const seen = new Set<string>();
    for (const balance of balances) {
      const lower = balance.walletAddress.toLowerCase();
      if (seen.has(lower)) {
        console.log(`  Duplicate: ${balance.walletAddress}`);
      }
      seen.add(lower);
    }
  } else {
    console.log('✅ No duplicate addresses found (case-insensitive)');
  }

  await prisma.$disconnect();
}

checkBalances().catch(console.error);

