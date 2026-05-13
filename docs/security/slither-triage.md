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
