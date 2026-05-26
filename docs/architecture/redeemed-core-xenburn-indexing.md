# Redeemed Core XEN Burn Indexing

## Purpose

xEnchanted Crypto stores XEN burn provenance inside Core NFTs.

A Core NFT is not only an NFT position with a nominal XNTD value. It is also readable protocol state that carries the amount of XEN burned to create and develop that Core state.

This document explains how redeemed Core NFT history can be indexed in the future to derive a clean `redeemedCoreXenBurn` value per address.

## Core principle

Only Core Redeem finalizes the XEN-burn signal.

Mint is the entry into the protocol.

Enchant develops Core state inside the protocol.

Stake is a temporary lifecycle phase.

Forge consumes already-issued XNTD and creates Forged NFT state.

Redeem is the final exit of a Core NFT from the Core lifecycle.

Therefore, future XEN-burn accounting for X1 or other downstream systems should use Core Redeem events as the finalized source of clean XEN-burn value.

## Redeemed event provenance

The `Redeemed` event includes both burn provenance fields:

- `xenBurned`
- `xntdBurned`

For Core NFT Redeem:

- `forged == false`
- `xenBurned > 0`
- `xntdBurned == 0`

For Forged NFT Redeem:

- `forged == true`
- `xenBurned == 0`
- `xntdBurned > 0`

This preserves the separation between the Core/XEN-origin layer and the Forged/XNTD layer.

## Core Enchant accumulation

Core Enchant accumulates the XEN burn provenance of the two source Core NFTs into the newly created Core NFT.

Conceptually:

    newCore.xenBurned = parent1.xenBurned + parent2.xenBurned

This means a future indexer does not need to count Mint or Enchant as finalized XEN-burn exits. It can wait until Core Redeem and then use the final `xenBurned` value emitted by the redeemed Core NFT.

## Indexing rule

A future indexer can derive per-address finalized Core XEN-burn value as:

    if Redeemed.forged == false:
        redeemedCoreXenBurn[Redeemed.owner] += Redeemed.xenBurned

Forged Redeem must not be counted toward clean XEN-burn value because Forged NFTs belong to the XNTD burn layer.

## What is intentionally not counted

### Mint

Mint is not counted as a finalized XEN-burn exit because it creates a live Core NFT inside the protocol.

### Enchant

Enchant is not counted because it develops Core state and transfers accumulated XEN burn provenance into the next Core NFT.

### Stake

Stake is not counted because it is a temporary lifecycle phase. The source NFT is restored through the Phoenix flow on stake redeem.

### Forge

Forge is not counted because it consumes already-issued XNTD. Any XEN burn provenance behind that XNTD has already been finalized through prior Core Redeem events.

### Forged NFT Redeem

Forged NFT Redeem is not counted because it exits XNTD-layer state, not clean Core/XEN-origin state.

## X1 direction

This model does not move XC state to X1.

Core level, nominal value, epoch, Forge state, Stake state, and other XC lifecycle properties remain part of the Ethereum XC machine.

A downstream system such as X1 can use only the clean finalized `redeemedCoreXenBurn` signal and create new native state from it.

In short:

    XC state stays in XC.
    Core Redeem finalizes XEN-burn signal.
    X1 can create new state from that signal.

## Test coverage

The event-level test coverage verifies:

- Core Redeem emits `xenBurned > 0` and `xntdBurned == 0`.
- Core Enchant followed by Redeem emits accumulated Core `xenBurned`.
- Forged Redeem emits `xenBurned == 0` and `xntdBurned > 0`.

## Design note

This documentation does not introduce a bridge, migration contract, or X1 implementation.

It only records the indexing model enabled by the `Redeemed` event provenance fields.

The goal is to keep the Ethereum XC machine as the source of truth for its own lifecycle while allowing future systems to derive a clean finalized XEN-burn signal from Core Redeem history.

## Validation

This change is event-observability only. It does not change protocol state transitions, minting rules, burn rules, access control, staking logic, Forge logic, or market behavior.

Validation performed:

- `npx hardhat compile`
- `npx hardhat test`
- `npx hardhat test test-fork/mainnet-xen.js`
- `slither .`

Results:

- Full local Hardhat test suite: 111 passing.
- Real XEN mainnet fork test suite: 2 passing.
- Slither completed analysis of 59 contracts with 101 detectors.
- Slither reported the existing known categories already covered by prior triage, including OpenZeppelin/library findings, mocks, timestamp-based protocol logic, naming conventions, and previously documented reentrancy/CEI patterns.
- No new state-changing logic was introduced by this change.
- The `Redeemed` event now exposes `xenBurned` and `xntdBurned` so future indexers can derive finalized Core XEN-burn value directly from Core Redeem history.
