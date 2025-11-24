/**
 * Script to create the genesis event with proper EIP-712 signature
 *
 * This script generates the genesis event that should be inserted into the database.
 * It computes the proper digest and signature using the TEE's mnemonic.
 *
 * Run with: npx ts-node scripts/create-genesis-event.ts
 */

import { createEvent, EventKind } from '../src/db/events';
import { prisma } from '../src/db/client';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Creating genesis event...');

  // Check if genesis event already exists
  const existingGenesis = await prisma.event.findFirst({
    where: { kind: 'genesis' },
  });

  if (existingGenesis) {
    console.log('Genesis event already exists:', existingGenesis.eventId.toString());
    return;
  }

  // Create genesis event
  const genesisPayload = JSON.stringify({
    message: 'Genesis event - initial event log entry',
    timestamp: new Date().toISOString(),
  });

  const genesisEvent = await createEvent(
    'genesis',
    genesisPayload,
    null, // No player for genesis
    null, // No nonce for genesis
    new Date() // Use current time
  );

  console.log('Genesis event created:');
  console.log('  Event ID:', genesisEvent.eventId.toString());
  console.log('  Kind:', genesisEvent.kind);
  console.log('  Digest:', genesisEvent.digest);
  console.log('  TEE Pubkey:', genesisEvent.teePubkey);
  console.log('  Block TS:', genesisEvent.blockTs.toISOString());
}

main()
  .catch((e) => {
    console.error('Error creating genesis event:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
