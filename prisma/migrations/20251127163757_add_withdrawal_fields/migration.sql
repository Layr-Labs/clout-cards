-- AlterTable
ALTER TABLE "player_escrow_balances" ADD COLUMN     "next_withdrawal_nonce" BIGINT,
ADD COLUMN     "withdrawal_signature_expiry" TIMESTAMP(3);
