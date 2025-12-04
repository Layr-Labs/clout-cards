# Manual Contract Verification Instructions for Basescan

Since Basescan requires API V2 and automated scripts may not support it yet, here are manual verification instructions.

## Implementation Contract: 0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC

1. Go to: https://sepolia.basescan.org/address/0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC#code
2. Click "Verify and Publish"
3. Select "Via Standard JSON Input" (recommended) or "Via flattened source code"
4. **Compiler Version**: `0.8.22+commit.4fc1097e` (or latest 0.8.22)
5. **Optimization**: No (or match your compilation settings)
6. **Constructor Arguments**: Leave empty (implementation has no constructor)
7. **Source Code**: 
   - For flattened: Run `cd onchain && forge flatten src/CloutCards.sol` and paste the output
   - For Standard JSON: Use the build-info JSON from `onchain/out/build-info/`

## Proxy Contract: 0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e

1. Go to: https://sepolia.basescan.org/address/0xBB8d2C98B6E3595f2a146dBCFFDe3AE52728981e#code
2. Click "Verify and Publish"
3. Select "Via Standard JSON Input" (recommended) or "Via flattened source code"
4. **Compiler Version**: `0.8.22+commit.4fc1097e` (or latest 0.8.22)
5. **Optimization**: No (or match your compilation settings)
6. **Constructor Arguments**: 
   ```
   0x00000000000000000000000032c5d2da604d49c4e7761aeda11fc94b2ec33fcc00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000044485cc955000000000000000000000000cc4a81f07d9e925e90873349c903e3fe93099b0a0000000000000000000000005f8a13ad2fad1362c6ddd0444d9a74581180fc7600000000000000000000000000000000000000000000000000000000
   ```
   This encodes:
   - Implementation address: `0x32C5D2da604D49c4E7761aEDa11FC94B2eC33fcC`
   - Initialize call data with owner: `0xCC4A81f07d9E925e90873349c903E3FE93099b0a` and house: `0x5f8A13aD2fAD1362C6ddd0444d9A74581180fC76`
7. **Source Code**: 
   - For flattened: Run `cd onchain && forge flatten lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol` and paste the output
   - For Standard JSON: Use the build-info JSON from `onchain/out/build-info/`

## Quick Commands

```bash
# Flatten implementation contract
cd onchain && forge flatten src/CloutCards.sol > /tmp/cloutcards_flattened.sol

# Flatten proxy contract  
cd onchain && forge flatten lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol > /tmp/erc1967proxy_flattened.sol

# View flattened files
cat /tmp/cloutcards_flattened.sol
cat /tmp/erc1967proxy_flattened.sol
```

## Notes

- The proxy constructor takes `(address _implementation, bytes memory _data)`
- The `_data` parameter is the encoded `initialize(owner, house)` function call
- Both contracts use Solidity 0.8.22
- No optimization was used during compilation

