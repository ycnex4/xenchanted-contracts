# xEnchanted Crypto Contracts

Smart contracts for xEnchanted Crypto, an NFT-based algorithmic mining protocol inspired by XEN-style first-principles crypto.

The protocol is built around immutable, no-admin rules:

- no premine;
- no founder allocation;
- no admin mint;
- no upgradeable proxy;
- no pause / blacklist controls;
- token emission based on user actions.

## Protocol Overview

Main flows:

- Mint Core NFT: user burns XEN and receives a Core NFT.
- Enchant: two same-level NFTs are burned to create a higher-level NFT.
- Forge: user burns XNTD and sacrifices a Core L1 NFT to create a Forged NFT.
- Stake: user burns a Core/Forged NFT into a Stake NFT position; on redeem, the original NFT is recreated and rewards are handled according to maturity rules.
- Market: users can list and buy Core/Forged NFTs through an ETH-only escrow secondary market.
- Redeem: eligible NFTs can be burned to mint XNTD according to protocol rules.

## Repository Structure

    contracts/
      core/       Core NFT contract
      forge/      Forged NFT creation contract
      staking/    Stake NFT lifecycle contract
      tokens/     XNTD token contract
      lens/       Read-only protocol and tokenURI lenses
      market/     ETH-only escrow secondary market for Core/Forged NFTs
      mocks/      Test mocks

    test/
      Local Hardhat unit/integration tests

    test-fork/
      Mainnet fork integration tests

    docs/
      Security notes, audit checkpoint, economics notes, and migration notes

## Current Verification Status

Latest confirmed results:

    Local Hardhat tests: 115 passing
    Mainnet fork real XEN integration test: 2 passing
    Avalanche fork real aXEN integration test: 2 passing
    Slither high issues: 0
    Bytecode size check: all production contracts below 24KB

Security documentation:

- [Production audit checkpoint](docs/production-audit-checkpoint.md)
- [Avalanche C-Chain deployment readiness](docs/avalanche-deployment-readiness.md)
- [Slither triage](docs/security/slither-triage.md)
- [Real XEN mainnet fork validation](docs/security/mainnet-fork-xen.md)
- [External review follow-ups](docs/security/external-review-followups.md)
- [Redeemed Core XEN Burn Indexing](docs/architecture/redeemed-core-xenburn-indexing.md) — documents how Core Redeem events expose finalized XEN-burn provenance for future indexing.
- [Bytecode size check](docs/security/bytecode-size-check.md)
- [Gas profiling notes](docs/security/gas-profiling-notes.md)
- [Gas profiling results](docs/security/gas-profiling-results.md)
- [Real XEN gas profile](docs/security/real-xen-gas-profile.md)
- [Mainnet deployment readiness](docs/mainnet-deployment-readiness.md)
- [Market v1 design notes](docs/market-v1.md)
- [Market Slither triage](docs/security/market-slither-triage.md) — documents Market v1 Slither findings, false positives, pull-payment rationale, and the intentional no-rescue policy.

Economic documentation:

- [Economics notes overview](docs/economics/README.md)
- [Early redeem penalty model](docs/economics/early-redeem-penalty-model.md)
- [L1 Forged staking policy](docs/economics/l1-forged-staking-policy.md)
- [Forge cap impact model](docs/economics/forge-cap-impact-model.md)
- [Numerical economics modeling](docs/economics/numerical-modeling.md)

Important limitation:

This repository has undergone internal review, static analysis triage, local testing, mainnet fork integration testing, bytecode size checking, and economic rationale documentation. This is not an independent third-party audit, not formal verification, and not a formal economic guarantee.

## Slither Static Analysis

Slither 0.11.5 was run against production contracts with mocks, tests, cache, artifacts, and dependencies filtered out.

Summary:

    Initial production-filtered Slither result: 111 findings
    Final production-filtered Slither result: 81 findings
    Final high issues: 0

Findings were either remediated or manually triaged in:

[docs/security/slither-triage.md](docs/security/slither-triage.md)

## Real XEN Mainnet Fork Test

A dedicated Hardhat mainnet fork test validates the mintWithXEN() flow against the real Ethereum XEN contract:

    0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8

The fork test confirmed:

- real XEN metadata and 18-decimal configuration;
- Core deployment using the real XEN address;
- required XEN allowance from user to Core before mintWithXEN();
- successful mintWithXEN() execution against the real XEN burn flow;
- correct Core L1 state after mint.

Details:

[docs/security/mainnet-fork-xen.md](docs/security/mainnet-fork-xen.md)

## Bytecode Size Check

All production contracts are currently below the Ethereum 24KB deployed bytecode limit.

Details:

[docs/security/bytecode-size-check.md](docs/security/bytecode-size-check.md)

## Economic Modeling Notes

Economic parameters should not be changed casually.

The current economic documentation records the implemented baseline, alternatives considered, risks, and parameters that may need deeper numerical modeling before mainnet deployment.

Current documented baseline:

- early redeem reward: `0`;
- early redeem nominal penalty: `1%`;
- staking requires `level > 1`;
- Core L1 NFTs are not stakeable;
- Forged L1 NFTs are not stakeable;
- Forged staking bonus unlocks only when the Forged NFT is stakeable;
- Forge min: `currentBaseNominal * 5`;
- Forge max: `currentBaseNominal * 1000`.

These documents do not change contract behavior. They document the current rationale and open modeling questions.

Details:

[docs/economics/README.md](docs/economics/README.md)

## Install

    npm ci

## Run Local Tests

    npx hardhat test

Expected current result:

    115 passing

## Run Real XEN Mainnet Fork Test

Create a local .env file with:

    MAINNET_RPC_URL=your_ethereum_mainnet_rpc_url
    XEN_WHALE=mainnet_address_with_enough_xen

Then run:

    npx hardhat test test-fork/mainnet-xen.js

Expected current result:

    2 passing

Notes:

- this uses a local Hardhat mainnet fork;
- it does not send real mainnet transactions;
- it does not require real ETH for gas;
- .env must not be committed.

## Mainnet Readiness Notes

Before any mainnet deployment:

- use the real Ethereum XEN contract address;
- do not deploy MockXEN;
- verify deployment wiring after deploy;
- run the full local test suite;
- run the real XEN mainnet fork test;
- run the real XEN gas profile if mintWithXEN gas needs to be refreshed;
- re-run Slither;
- review bytecode size;
- perform gas profiling and update measured gas results;
- revisit open economic modeling questions;
- perform independent external audit;
- consider formal verification / expanded invariant testing.

## License

TBD.
