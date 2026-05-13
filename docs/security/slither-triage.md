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
