# Withdrawing Funds

When you're ready to cash out, you can withdraw your escrow balance back to your wallet.

## Prerequisites

Before withdrawing:

1. **Stand up from any tables** - Your table balance must be returned to escrow
2. **Have a positive escrow balance** - Nothing to withdraw if balance is zero

## How Withdrawals Work

1. You request a withdrawal through the app
2. The server signs an authorization message
3. You submit the signed withdrawal to the smart contract
4. The contract transfers ETH to your wallet

## Making a Withdrawal

1. Go to your **Profile** page
2. Click the **"Cash Out"** button
3. Enter the amount you want to withdraw
4. Click **"Withdraw"**
5. Confirm the transaction in your wallet

!!! info "Gas Fees"
    Withdrawals require a blockchain transaction, so you'll pay gas fees from your wallet (not your escrow balance).

## Withdrawal Limits

| Limit | Amount |
|-------|--------|
| Minimum | 0.0001 ETH |
| Maximum | Your full escrow balance |

## Withdrawal Security

Withdrawals use a signed message system for security:

- Each withdrawal request gets a unique **nonce**
- The server signs the withdrawal authorization
- The signature expires after a short time
- Only you can execute the withdrawal (your wallet)

!!! warning "One at a time"
    You can only have one pending withdrawal at a time. Complete or let the current one expire before requesting another.

## Transaction Times

| Network | Confirmation Time |
|---------|-------------------|
| Base Sepolia | ~2-5 seconds |

## Troubleshooting

### "Withdrawal pending"
You already have a pending withdrawal. Wait for it to complete or expire.

### "Insufficient balance"
Your escrow balance is less than the requested amount. Check if you have funds at a table.

### Transaction failed
Check that you have enough ETH in your wallet for gas fees.

