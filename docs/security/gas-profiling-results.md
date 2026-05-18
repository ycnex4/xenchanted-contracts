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

| Flow                                    |  Gas Used |
| --------------------------------------- | --------: |
| Market deploy                           | 1,055,298 |
| MockXEN approve Core for mintWithXEN    |    45,962 |
| Core mintWithXEN L1                     |   287,670 |
| Enchant Core L1 + L1 -> L2              |   234,918 |
| Enchant Core L10 + L10 -> L11           |   262,116 |
| Forge min amount                        |   299,189 |
| Forge 10K XNTD nominal                  |   258,159 |
| Stake start Core L2                     |   301,555 |
| Stake matured redeem / Phoenix Core L2  |   301,803 |
| Stake start Core L11                    |   304,367 |
| Stake matured redeem / Phoenix Core L11 |   270,652 |
| Enchant Forged L1 + L1 -> L2            |   252,973 |
| Market list Core L1                     |   309,274 |
| Market cancel Core L1 listing           |   114,531 |
| Market list Core L1 for buy             |   309,274 |
| Market buy Core L1                      |   152,365 |
| Market withdraw proceeds                |    36,143 |
| Market list Core L1 for withdrawFor     |   309,274 |
| Market buy Core L1 for withdrawFor      |   152,365 |
| Market withdraw proceeds for seller     |    38,457 |
| Market list Core L11                    |   320,084 |
| Market cancel Core L11 listing          |   114,531 |
| Market list Forged L2                   |   320,084 |
| Market cancel Forged L2 listing         |   114,531 |

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

Market v1 measurements also support fixed-size state-changing behavior:

- Market deploy is a one-time deployment cost for the standalone escrow contract;
- list transfers exactly one Core ERC721 token into escrow and creates exactly one listing record;
- cancel removes exactly one active listing and transfers exactly one NFT back to the seller;
- buy removes exactly one active listing, credits one proceeds balance and transfers exactly one NFT to the buyer;
- withdrawProceeds clears one proceeds balance and performs one ETH call;
- withdrawProceedsFor clears one seller proceeds balance and performs one ETH call to that seller, while the caller only pays gas;
- Market pagination is read-only and does not affect state-changing gas;
- Market flows do not traverse parent history, full collection size, NFT level depth, or nominal magnitude.

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

Market buy gas uses an EOA buyer in this profile. Buying to a contract receiver may vary depending on the receiver's `onERC721Received` implementation.

## Current Conclusion

The initial profile supports the expected flat gas-scaling assumption by level and nominal magnitude.

No state-changing user flow appears to scale with full collection size, parent history, level depth, or nominal amount.

The updated profile supports the expected flat gas-scaling assumption by level and nominal magnitude for Core, Forge, Stake, and Market flows.

No measured state-changing user flow appears to scale with full collection size, parent history, level depth, or nominal amount.

Market v1 adds fixed-size escrow flows. `list`, `cancel`, `buy`, `withdrawProceeds`, and `withdrawProceedsFor` each operate on one NFT/listing/proceeds record at a time, with no unbounded iteration.

Further profiling can refine these numbers, but there is no current evidence of unbounded gas growth in the measured production user flows.
