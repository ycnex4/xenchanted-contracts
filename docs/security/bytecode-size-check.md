# Bytecode Size Check

This document records the deployed bytecode size check for the xEnchanted Crypto contracts.

## Context

Ethereum mainnet contract size limit is 24,576 bytes.

This check was refreshed after adding immutable Ethereum/Avalanche protocol
profiles and exposing the Stake range through the NFT Lens.

## Production Contracts Result

All production contracts are below the 24KB deployed bytecode limit.

| Contract | Size, bytes | Remaining | Usage | Status |
| --- | ---: | ---: | ---: | --- |
| xEnchantedNFT | 18,204 | 6,372 | 74.1% | OK |
| xEnchantedStakeTokenURILens | 17,346 | 7,230 | 70.6% | OK |
| xEnchantedTokenURILens | 14,653 | 9,923 | 59.6% | OK |
| xEnchantedStake | 13,538 | 11,038 | 55.1% | OK |
| xEnchantedNFTLens | 5,925 | 18,651 | 24.1% | OK |
| XenchantedMarket | 4,392 | 20,184 | 17.9% | OK |
| XNTDToken | 3,694 | 20,882 | 15.0% | OK |
| xEnchantedForge | 3,071 | 21,505 | 12.5% | OK |

## Test / Mock Contracts

These contracts are not part of the production deployment, but were present in the local artifacts during the check.

| Contract | Size, bytes | Remaining | Usage | Status |
| --- | ---: | ---: | ---: | --- |
| MockXEN | 2,618 | 21,958 | 10.7% | OK |
| MockXNTDBurnRedeemable | 859 | 23,717 | 3.5% | OK |

## Notes

The largest production contract is `xEnchantedNFT` at 18,204 bytes, or 74.1% of the 24KB limit.

The largest rendering contract is `xEnchantedStakeTokenURILens` at 17,346 bytes, or 70.6% of the 24KB limit.

There is currently no bytecode-size blocker for testnet or mainnet deployment.
