# xEnchanted Crypto — Slither Static Analysis Triage

Status: Work in progress  
Tool: Slither 0.11.5  
Scope: production contracts, excluding node_modules, mocks, tests, cache, artifacts

## Remediated findings

### Dead code

Slither reported unused helper functions:

- `xEnchantedNFT._staticOk(address,bytes)`
- `xEnchantedNFTLens._exists(uint256)`

Resolution: removed both unused helper functions.

Status: fixed.

### Redundant statements

Slither reported redundant statements used to silence unused local variables, including tuple-destructuring leftovers.

Resolution: removed redundant statements and replaced unnecessary tuple bindings with intentionally omitted tuple fields.

Status: fixed.

### Unused return in Forge burn hook

Slither reported that `xEnchantedForge.forge()` ignored the return value from `CORE.burnL1ForForge(baseId, msg.sender)`.

Manual assessment: this was a valid code-quality finding. The Forge contract only needed the Core contract to validate and burn the Core L1 NFT. The returned `NFTData` snapshot was not used by Forge.

Resolution: removed the unused return value from `burnL1ForForge` and from the Forge hook interface.

Status: fixed.

## Accepted findings

### Unused return / partial tuple usage in view and preview functions

Remaining `unused-return` findings are limited to intentional partial tuple usage in read-only view, preview, or lens-style functions.

Affected examples include:

- `xEnchantedForge.previewForge`
- `xEnchantedNFTLens.previewRedeem`
- `xEnchantedNFTLens.previewEnchant`
- `xEnchantedNFTLens.previewEnchantDetailed`
- `xEnchantedStake.previewStakeAPRBreakdown`
- `xEnchantedStake.previewStake`

Manual assessment: accepted informational finding.

Reason: the called functions return broad protocol state tuples, while the preview/lens functions intentionally consume only the fields required for their specific calculation or UI-facing response. The ignored tuple fields are not used for authorization, accounting, mint/burn logic, ownership checks, or state transitions.

Resolution: no further code change. The only state-changing ignored return value was removed from the Forge burn hook.

Status: accepted / documented.

### Low-level calls / staticcall in read-only flows

Slither reported low-level calls in the following places:

- `xEnchantedNFT._readAddr`
- `xEnchantedNFTLens.previewRedeem`
- `xEnchantedNFTLens._tradeInfo`
- `xEnchantedStakeTokenURILens.tokenURI`
- `xEnchantedTokenURILens.tokenURI`

Manual assessment: accepted informational finding.

Reason: all remaining low-level calls are `staticcall`-based read operations. They do not transfer ETH, do not mutate state, and are not used as arbitrary execution hooks. The calls are used for controlled read-only behavior:

- `xEnchantedNFT._readAddr` is used during initialization as a deployment wiring handshake. It verifies that the Stake and Forge contracts expose the expected `CORE()` / `XNTD()` addresses before Core burns deployer rights.
- `xEnchantedNFTLens.previewRedeem` and `xEnchantedNFTLens._tradeInfo` use `staticcall` to check `ownerOf(id)` without bubbling ERC721 reverts for non-existent IDs, allowing the lens to return a safe empty result instead of reverting.
- Core and Stake tokenURI lenses use `staticcall` for existence checks and normalize non-existent-token failures to the protocol's stable `"NE"` revert reason.

Resolution: no code change. The use of `staticcall` is intentional and limited to read-only / metadata / initialization handshake flows.

Status: accepted / documented.

### External call inside loop / batch StakeView construction

Slither reported an external call inside a loop in `xEnchantedStake.getStakeViews(uint256[])`.

The loop builds a `StakeView` for each requested Stake NFT. During `_buildStakeView`, the contract calls `CORE.epochAt(p.startTs)` to derive the stake epoch from the Core contract's epoch rules.

Manual assessment: accepted informational finding.

Reason: the affected function is an `external view` batch-read helper. It does not mutate state, transfer ETH, mint, burn, authorize, or update accounting. The external call is a read-only call to the trusted immutable Core contract and is used to keep epoch calculation sourced from Core rather than duplicating epoch logic in Stake.

The practical limitation is read scalability: very large `ids` arrays may become expensive for RPC simulation or exceed gas limits for on-chain view calls. The intended use is frontend/wallet inventory reads with bounded arrays.

Resolution: no code change. Storing `stakeEpoch` in each stake position would remove the read call but would add storage cost and increase stake transaction cost. The current design intentionally favors computed read-time derivation from Core.

Status: accepted / documented.

### Timestamp usage

Slither reported timestamp-related findings across epoch, halving, APR, staking, preview, and invariant-checking code.

Manual assessment: accepted protocol design / informational finding.

Reason: timestamp usage is intentional and limited to protocol timekeeping:

- epoch and halving calculations;
- base APR decay over long time intervals;
- stake start and end timestamps;
- stake maturity checks;
- preview and StakeView maturity reporting.

The protocol does not use `block.timestamp` for randomness, lottery selection, winner selection, short-window price decisions, or arbitrary privileged outcomes. Time-dependent rules operate over long windows such as 180-day epochs and 30–730 day staking terms. Small block timestamp variance is not expected to create a material advantage or alter protocol accounting in a meaningful way.

Some Slither entries under this detector also point to invariant or sentinel checks, such as zero/non-zero field validation and level/parent checks. These are not timestamp-risk patterns and are treated as static-analysis noise.

Resolution: no code change.

Status: accepted / documented.

### Strict equality / invariant and sentinel checks

Slither reported strict equality checks in `_applyHalving`, `_assertInv`, and `_earlyRedeemNominal`.

Manual assessment: accepted informational finding / false positive for protocol invariants.

Reason: the reported strict equality checks are intentional invariant and sentinel-value checks. They are not used for randomness, exact timestamp matching, winner selection, short-window price logic, or fragile balance equality assumptions.

The checks validate protocol state structure, including:

- zero/non-zero provenance fields for Core versus Forged NFTs;
- Core L1 versus evolved NFT parent linkage;
- level-specific rules such as `level == 1`;
- halving lower-bound protection when repeated division would reduce a value to zero;
- early redeem nominal protection so a non-zero nominal NFT cannot be reduced to zero by penalty rounding.

Resolution: no code change.

Status: accepted / documented.

### Reentrancy warnings

Slither reported reentrancy-pattern findings in `xEnchantedNFT.init`, `xEnchantedNFT.mintWithXEN`, `xEnchantedStake.stake`, and previously in `xEnchantedForge.forge`.

Manual assessment: partially remediated, partially accepted with documentation and follow-up testing.

#### Forge reentrancy hardening

Slither previously reported an event-after-external-calls pattern in `xEnchantedForge.forge`.

Resolution: added a local `nonReentrant` guard to the Forge contract and applied it to the public `forge` entry point.

Status: fixed / hardened.

#### Core init

`xEnchantedNFT.init` performs a one-time call to `XNTD.bindForge(forge)` during immutable protocol wiring.

Manual assessment: accepted.

Reason: `init` is restricted to the original deployer, performs explicit contract/address handshakes before binding, and burns deployer rights after successful initialization. The concrete `XNTDToken.bindForge` implementation only sets the one-time Forge binding and emits an event. It does not transfer tokens, call external contracts, invoke callbacks, or call back into Core. If binding fails, the entire init transaction reverts.

Status: accepted / documented.

#### Core mintWithXEN

`xEnchantedNFT.mintWithXEN` calls `XEN.burn(msg.sender, xenAmt)` before minting the Core L1 NFT.

Manual assessment: accepted for the current Sepolia review, with required follow-up before mainnet.

Reason: this is the intended XEN-style burn callback flow. The function is protected by Core `nonReentrant`, and Core state changes occur only after the burn call succeeds. However, because Sepolia tests currently use `MockXEN`, this path should be covered by a mainnet fork test against the real XEN contract before mainnet deployment.

Status: accepted / documented; mainnet fork test required before mainnet.

#### Stake stake()

`xEnchantedStake.stake` calls the trusted immutable Core contract through `CORE.burnForStaking(id, msg.sender)` before recording the stake position and minting the Stake NFT.

Manual assessment: accepted.

Reason: `stake` is protected by Stake `nonReentrant`. The external call is to the protocol Core contract, not to an arbitrary user-controlled target. Core `burnForStaking` is restricted by `onlyStaking`, protected by Core `nonReentrant`, validates ownership and NFT state, burns the Core/Forged NFT, and returns a snapshot. Stake then records the position before `_safeMint`.

Status: accepted / documented. Additional targeted reentrancy tests around stake mint receiver behavior are recommended before mainnet.

### Missing inheritance suggestions

Slither reported missing-inheritance suggestions for several contracts and local interfaces, including lens contracts, Stake, and XNTDToken.

Manual assessment: accepted informational finding.

Reason: the reported interfaces are used primarily as local call-boundary interfaces for cross-contract reads and protocol hooks, not as required inheritance bases. Adding inheritance only to satisfy the static analyzer would increase coupling between Core, Stake, Forge, Token, and Lens modules without providing a meaningful security benefit.

The contracts already expose the expected functions used by their protocol counterparts, and this behavior is covered by wiring and source-of-truth tests.

Resolution: no code change.

Status: accepted / documented.

### Naming convention

Slither reported naming-convention findings for protocol names, acronyms, immutable contract links, and constant-like public variables/getters.

Manual assessment: accepted informational finding.

Reason: the naming is intentional and reflects protocol terminology and readability:

- `XEN`, `XNTD`, `CORE`, `FORGE`, `STAKING` are protocol acronyms or immutable protocol links;
- `GENESIS_TS`, `INITIAL_NOMINAL`, `INITIAL_XEN_BURN`, `HALVING_INTERVAL`, and similar names are constant or constant-like protocol parameters;
- `xEnchantedNFT`, `xEnchantedForge`, `xEnchantedStake`, and lens names follow the project branding and deployed contract naming style.

Changing these names would be cosmetic, would affect ABI/readability expectations, and would not improve protocol safety.

Resolution: no code change.

Status: accepted / documented.

### Divide before multiply / Core enchant nominal formula

Slither reported divide-before-multiply in `xEnchantedNFT.enchant` and `xEnchantedNFT.previewEnchant`.

Manual assessment: accepted protocol design.

Reason: Core enchant intentionally computes the new Core NFT nominal as the integer average of the two parent nominals multiplied by the enchant multiplier:

`newNominal = floor((nominalA + nominalB) / 2) * ENCHANT_MULTIPLIER`

This behavior is mirrored by `previewEnchant`, covered by tests, and defines the protocol's deterministic rounding rule. Changing the formula to multiply before division would alter protocol economics for parent pairs with odd nominal sums.

Resolution: no code change.

Status: accepted / documented.
