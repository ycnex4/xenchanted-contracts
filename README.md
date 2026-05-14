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
- Redeem: eligible NFTs can be burned to mint XNTD according to protocol rules.

## Repository Structure

    contracts/
      core/       Core NFT contract
      forge/      Forged NFT creation contract
      staking/    Stake NFT lifecycle contract
      tokens/     XNTD token contract
      lens/       Read-only protocol and tokenURI lenses
      mocks/      Test mocks

    test/
      Local Hardhat unit/integration tests

    test-fork/
      Mainnet fork integration tests

    docs/
      Security notes, audit checkpoint, and migration notes

## Current Verification Status

Latest confirmed results:

    Local Hardhat tests: 70 passing
    Mainnet fork real XEN integration test: 2 passing
    Slither high issues: 0

Security documentation:

- [Production audit checkpoint](docs/production-audit-checkpoint.md)
- [Slither triage](docs/security/slither-triage.md)
- [Real XEN mainnet fork validation](docs/security/mainnet-fork-xen.md)
- [External review follow-ups](docs/security/external-review-followups.md)

Important limitation:

This repository has undergone internal review, static analysis triage, local testing, and mainnet fork integration testing. This is not an independent third-party audit and not formal verification.

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

## Install

    npm install

## Run Local Tests

    npx hardhat test

Expected current result:

    70 passing

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
- re-run Slither;
- perform independent external audit;
- consider formal verification / expanded invariant testing.

## License

TBD.
