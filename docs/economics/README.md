# xEnchanted Crypto Economics Notes

This folder contains economic modeling notes and protocol-parameter rationale for xEnchanted Crypto.

These documents are not formal economic guarantees. They record the current implemented baseline, alternatives considered, risks, and parameters that may require deeper numerical modeling before mainnet deployment.

## Documents

| Document | Topic | Current Status |
| --- | --- | --- |
| `early-redeem-penalty-model.md` | Early stake redeem penalty | Keep current 1% flat nominal penalty for now |
| `l1-forged-staking-policy.md` | Whether L1 Forged NFTs should be stakeable | Keep current L1 staking ban as an economic gate |
| `forge-cap-impact-model.md` | Forge min/max bounds and cap scenarios | Keep current `base * 5` min and `base * 1000` max for now; revisit after deeper modeling |

## Current Baseline

The current contract baseline remains unchanged:

- early redeem reward: `0`
- early redeem nominal penalty: `1%`
- staking requires `level > 1`
- Core L1 NFTs are not stakeable
- Forged L1 NFTs are not stakeable
- Forged staking bonus unlocks only when the Forged NFT is stakeable
- Forge min: `currentBaseNominal * 5`
- Forge max: `currentBaseNominal * 1000`

## Review Principles

Economic parameters should not be changed casually.

Before changing contract logic, each parameter should be evaluated against:

- user behavior;
- protocol simplicity;
- first-principles/no-admin design;
- XNTD burn demand;
- NFT nominal distribution;
- staking participation;
- frontend clarity;
- auditability.

## Current Recommendation

Do not change the contracts at this stage.

The current economics are documented as the working baseline. Deeper numerical modeling may be performed before mainnet deployment, especially for the Forge cap and long-term distribution behavior.

