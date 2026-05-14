# Gas Profiling Results

This document records an initial local Hardhat gas profile for selected xEnchanted Crypto protocol flows.

## Context

This profile was created after the `economic-modeling` documentation branch was merged into `main`.

The goal is to empirically check the main state-changing flows and confirm the expected gas behavior described in `gas-profiling-notes.md`.

This is an initial local Hardhat profile, not a final mainnet gas guarantee.

## Environment

- Network: local Hardhat network
- XEN implementation: `MockXEN`
- Receiver type: EOA wallets
- Solidity optimizer: enabled
- Optimizer runs: 200
- EVM version: cancun
- viaIR: enabled
- High-level confirmation target: L10
- Initial local nominal: 100 XNTD
- Initial local MockXEN burn: 10 MockXEN

Setup transactions are excluded unless explicitly listed as measured rows.

## Gas Profile Summary

| Flow | Gas Used |
| --- | ---: |
| MockXEN approve Core for mintWithXEN | 45,962 |
| Core mintWithXEN L1 | 287,670 |
| Enchant Core L1 + L1 -> L2 | 234,918 |
| Enchant Core L10 + L10 -> L11 | 262,116 |
| Forge min amount | 299,189 |
| Forge 10K XNTD nominal | 258,159 |
| Stake start Core L2 | 301,555 |
| Stake matured redeem / Phoenix Core L2 | 301,803 |
| Stake start Core L11 | 304,367 |
| Stake matured redeem / Phoenix Core L11 | 270,652 |
| Enchant Forged L1 + L1 -> L2 | 252,973 |

## Observations

The L10 confirmation run does not show gas growth proportional to NFT level depth.

This matches the architecture:

- NFT level is a fixed-size field;
- nominal is a fixed-size integer;
- arithmetic cost does not depend on numeric magnitude;
- Enchant operates on exactly two token IDs;
- Stake redeem operates on one stake position;
- Forge operates on one Core L1 sacrifice and one XNTD burn amount;
- protocol flows do not traverse parent history or historical levels.

Observed differences between low-level and high-level scenarios are expected to come from ordinary EVM/storage effects such as:

- cold/warm storage access;
- zero -> non-zero writes;
- non-zero -> zero deletes/refunds;
- ERC721 mint/burn bookkeeping;
- state differences between first and later operations.

## Important Limitation

These numbers are local Hardhat measurements.

They are useful for relative flow comparison and architecture validation, but should not be treated as final mainnet gas guarantees.

`mintWithXEN` should still be profiled against the real XEN contract on a mainnet fork if exact callback overhead is needed.

`_safeMint` to a contract receiver may depend on the receiver's `onERC721Received` implementation. This profile uses EOA receivers.

## Current Conclusion

The initial profile supports the expected flat gas-scaling assumption by level and nominal magnitude.

No state-changing user flow appears to scale with full collection size, parent history, level depth, or nominal amount.

Further profiling can refine these numbers, but there is no current evidence of unbounded gas growth in the core user flows measured here.

