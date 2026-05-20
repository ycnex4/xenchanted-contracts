# XenchantedMarket Slither Triage

This document records the Slither findings related to `XenchantedMarket.sol` and the security-review decision for Market v1.

## Scope

Market v1 is an ETH-only secondary market for xEnchanted Core ERC-721 NFTs.

Supported assets:

- Core NFT
- Forged NFT

Unsupported assets:

- Stake NFT
- Any non-Core ERC-721 collection

Market v1 has:

- no admin
- no protocol fee
- no pause
- no upgrade path
- no rescue functions

Listed NFTs are held in escrow by the Market contract. Seller ETH proceeds are credited through pull-payment accounting and withdrawn later by the seller or through `withdrawProceedsFor(seller)`, where ETH is always sent to the seller.

## Intentional no-rescue policy

The Market intentionally does not implement a rescue function.

Direct `safeTransferFrom` transfers are rejected by the manual ERC-721 receiver guard. The contract accepts only the exact Core NFT transfer expected during `list()`.

Unsafe ERC-721 `transferFrom` can bypass receiver checks by ERC-721 design. If a user manually transfers an NFT into the Market contract through unsafe `transferFrom`, this is treated as documented technical user error. The immutable no-admin Market does not provide a rescue path because a permissionless rescue function can become a theft vector for mistakenly transferred third-party NFTs.

## Slither: reentrancy-no-eth / reentrancy-benign in `list()`

Slither reports `list()` because it performs an external call before writing the final listing state.

External call:

    CORE.safeTransferFrom(msg.sender, address(this), tokenId);

This is a known false positive for Market v1.

Reasons:

1. `list()` is protected by `nonReentrant`.
2. All other external mutating functions are also protected by `nonReentrant`:
   - `buy`
   - `cancel`
   - `withdrawProceeds`
   - `withdrawProceedsFor`
3. The ERC-721 receiver guard accepts only one exact expected transfer:
   - expected collection: `CORE`
   - expected seller: `msg.sender`
   - expected token ID: `tokenId`
4. Any reentrant attempt into Market mutators during `safeTransferFrom` is blocked by `ReentrancyGuard`.
5. If any later operation reverts, the whole transaction reverts, including the NFT transfer.

The current architecture is intentionally simpler and safer than introducing a separate pending-listing state before the escrow transfer.

A pending-listing rewrite would increase state-machine complexity without improving the real security model.

Decision: no contract change. Documented false positive.

## Slither: low-level-calls in `_withdrawProceeds()`

Slither reports the ETH transfer:

    (bool ok, ) = seller.call{value: amount}("");

This is expected for ETH pull payments.

The function updates accounting before the external call:

    proceeds[seller] = 0;
    totalProceeds -= amount;

If the ETH call fails, the function reverts and EVM rollback restores the previous accounting state.

Decision: no contract change. Standard pull-payment pattern.

## Slither: missing-inheritance involving test receiver interface

Slither reports that `XenchantedMarket` should inherit from a test/mock receiver interface.

This is not applicable. The Market implements the production ERC-721 receiver interface directly:

    IERC721Receiver

Test-only helper interfaces are not part of the production inheritance model.

Decision: no contract change. False positive / test-noise.

## Summary

Market Slither findings are triaged as follows:

| Finding | Decision |
|---|---|
| `list()` reentrancy warning | False positive; protected by `nonReentrant` and exact receiver guard |
| `_withdrawProceeds()` low-level call | Accepted pull-payment pattern |
| Missing inheritance for test receiver | Test/mock noise |
| No rescue function | Intentional no-admin immutable design decision |

No Market contract changes are required from this Slither pass.
