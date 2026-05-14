# Gas Profiling Notes

This document records the initial gas-risk review for the xEnchanted Crypto contracts.

## Context

This review was created after the security hardening baseline and bytecode size check.

The goal is not to change protocol logic, but to identify the flows that should be measured before mainnet deployment.

## High-Priority Flows To Measure

### 1. Core L1 Mint

Flow:

- user approves Core to spend XEN;
- Core calls real XEN `burn(user, amount)`;
- XEN spends allowance and burns user XEN;
- XEN callback validates Core burn context;
- Core mints Core L1 NFT.

Gas considerations:

- real XEN approval is a separate ERC20 transaction;
- `mintWithXEN()` itself includes external XEN burn call and ERC721 mint;
- already validated against real XEN on a Hardhat mainnet fork.

### 2. Enchant

Flow:

- user provides two NFTs of the same level and same category;
- Core burns both parent NFTs;
- Core mints a new higher-level NFT;
- parent IDs are stored in the new NFT data.

Gas considerations:

- two ERC721 burns;
- one ERC721 mint;
- storage write for the new NFT state;
- higher levels do not inherently increase loop cost because the operation uses two token IDs, not historical traversal.

### 3. Forge

Flow:

- user burns XNTD through the protocol-bound Forge path;
- user sacrifices a Core L1 NFT;
- Core mints a Forged NFT.

Gas considerations:

- XNTD burn path;
- Core L1 burn/sacrifice path;
- Forged NFT state write;
- Forge min/max bounds are simple view calculations based on current base nominal.

### 4. Stake Start

Flow:

- user selects a Core/Forged NFT with level > 1;
- original NFT is burned into a stake position;
- Stake NFT is minted with the same tokenId;
- stake snapshot is stored.

Gas considerations:

- ERC721 burn of the original NFT;
- ERC721 mint of the Stake NFT;
- stake snapshot storage;
- L1 staking is intentionally disabled as an economic gate.

### 5. Stake Redeem / Phoenix Mint

Flow:

- Stake validates active position and ownership;
- Stake burns the Stake NFT;
- Stake deletes the position;
- Stake calls Core to recreate the original NFT;
- if mature, Core mints the XNTD reward;
- if early, reward is zero and nominal is reduced by early penalty.

Gas considerations:

- cross-contract flow between Stake and Core;
- ERC721 burn of Stake NFT;
- storage delete for stake position;
- ERC721 phoenix mint of original NFT;
- optional ERC20 reward mint;
- this is likely one of the most important flows to measure.

### 6. Lens / View Calls

Flow:

- read-only aggregation for frontend, NFT views, tokenURI and SVG rendering.

Gas considerations:

- most lens calls are off-chain `eth_call`;
- tokenURI/SVG rendering can be computationally heavy but is normally used as a view call;
- batch view helpers can be expensive and are intended for frontend reads, not state-changing protocol execution.

## Current Risk Notes

- No high-level operation appears to scale with the full collection size.
- Enchant scales with exactly two input NFTs.
- Stake redeem scales with one stake position.
- Batch lens helpers may scale with input array length and should remain frontend/read-only helpers.
- TokenURI lenses are bytecode-heavy but still below the 24KB limit.

## Measurements Still Needed

Before mainnet deployment, record actual gas usage for:

| Flow | Measurement Needed |
| --- | --- |
| Core L1 mint | gas for approve + mintWithXEN |
| Enchant | gas for same-level Core enchant and Forged enchant |
| Forge | gas for XNTD burn + L1 sacrifice + Forged mint |
| Stake start | gas for Core/Forged L2+ stake start |
| Stake early redeem | gas for early redeem / phoenix mint |
| Stake matured redeem | gas for matured redeem + XNTD reward mint |
| Lens reads | approximate off-chain call cost / frontend performance only |

## Mainnet Readiness Conclusion

Gas profiling is still required before mainnet deployment.

Current architecture does not show obvious unbounded gas growth in core state-changing user flows, but the exact gas costs should be measured and documented using Hardhat tests or a gas reporter before final deployment.

