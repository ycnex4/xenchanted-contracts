# External Review Follow-ups

Status: in progress / documented hardening  
Scope: architectural review follow-up items before mainnet readiness

## XEN burn callback assumption

`xEnchantedNFT.onTokenBurned()` is required for the real XEN burn integration.

Real XEN calls this callback during `XEN.burn(user, amount)`, while `mintWithXEN()` is still executing. The callback is intentionally `view` and only authenticates that the caller is the immutable XEN contract configured at Core deployment.

Security constraint:

- `onTokenBurned()` must remain view-only;
- it must not write Core state;
- any future state change inside this callback would create a reentrancy-sensitive path during `mintWithXEN()`.

## XNTD integrator burn callback constraint

`XNTDToken.burn(user, amount)` supports third-party integrator burn callbacks through `onXNTDBurned(user, amount)`.

The function now uses a local `nonReentrant` guard. This is intentional hardening because the integrator callback is invoked after allowance spending, burn accounting, and token burn state changes.

Integrator constraint:

- `onXNTDBurned()` is a notification hook;
- integrator callbacks must not re-enter XNTD while `burn()` is executing;
- nested XNTD operations from inside the callback are intentionally blocked by `nonReentrant`.

This limits callback flexibility, but reduces reentrancy surface for generic integrator flows.

## Stake Phoenix flow

Stake redemption uses a multi-contract flow:

`Stake.redeem()` -> `Core.redeemStakedAndPhoenixMint()` -> Core NFT remint and optional XNTD reward mint.

Important ordering:

- Stake validates ownership and active position;
- Stake burns the Stake NFT;
- Stake deletes the stored position;
- only after local state changes does Stake call Core;
- Core validates the stored snapshot and remints the original Core/Forged NFT;
- if matured, Core mints the XNTD reward.

This follows Checks-Effects-Interactions at the Stake level. Stake and Core are protected by `nonReentrant`.

The flow may still trigger external receiver logic through ERC721 safe minting, so the multi-contract reentrancy chain is documented as an important review point.

## Halving floor

The halving helper applies a deterministic lower bound:

`_applyHalving(value, k)` returns at least `1`.

As a result, current base nominal and current XEN burn amount never decay to zero. After a very large number of epochs, both values asymptotically reach a minimum value of `1 wei`.

This is intentional: protocol minting remains mathematically defined and never reaches a zero-cost / zero-nominal state.

Economic interpretation:

- the floor is not expected to matter during normal project time horizons;
- it should be treated as a deterministic lower-bound rule;
- it is not a hidden admin or mutable parameter.

## Core enchant rounding rule

Core enchant intentionally computes nominal as:

`newNominal = floor((nominalA + nominalB) / 2) * ENCHANT_MULTIPLIER`

This means the average is rounded down before multiplication.

The same rule is used by `previewEnchant()` and the state-changing `enchant()` flow.

This is accepted protocol behavior. Changing to multiply-before-divide or rounding up would alter protocol economics, especially for small odd nominal sums.

## L1 staking gate and Forged NFT APR bonus

Staking currently requires `level > 1`.

This means both Core L1 and Forged L1 NFTs are not stakeable.

Rationale:

- staking is reserved for evolved NFTs;
- Core L1 is the entry-level protocol NFT;
- Forged L1 is already created through XNTD burn and Core L1 sacrifice, but Forged NFTs also receive a permanent `+5% APR` bonus once stakeable;
- allowing immediate L1 Forged staking would let users burn XNTD, mint a Forged L1, and immediately receive the Forged APR bonus without first evolving the position.

The current rule acts as an economic gate: Forged APR bonus applies only after the Forged NFT reaches L2+ through enchant/evolution.

This is an intentional design constraint, not a staking bug.
