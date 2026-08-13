# Bytecode Size Check

This document records the deployed bytecode size check for the xEnchanted Crypto contracts.

## Context

Ethereum mainnet contract size limit is 24,576 bytes.

This check was refreshed on 2026-08-13 during Avalanche deployment readiness.
The Avalanche preparation changes no production Solidity source.

## Production Contracts Result

All production contracts are below the 24KB deployed bytecode limit.

| Contract | Size, bytes | Remaining | Usage | Status |
| --- | ---: | ---: | ---: | --- |
| xEnchantedNFT | 18,031 | 6,545 | 73.4% | OK |
| xEnchantedStakeTokenURILens | 17,346 | 7,230 | 70.6% | OK |
| xEnchantedTokenURILens | 14,653 | 9,923 | 59.6% | OK |
| xEnchantedStake | 13,331 | 11,245 | 54.2% | OK |
| xEnchantedNFTLens | 4,896 | 19,680 | 19.9% | OK |
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

The largest production contract is `xEnchantedNFT` at 18,031 bytes, or 73.4% of the 24KB limit.

The largest rendering contract is `xEnchantedStakeTokenURILens` at 17,346 bytes, or 70.6% of the 24KB limit.

There is currently no bytecode-size blocker for testnet or mainnet deployment.
