# Avalanche C-Chain Deployment Readiness

## Status

Avalanche-specific preflight, fork integration, deployment and post-deployment
check paths are prepared for review. On 2026-08-13, the read-only live-network
preflight passed and the real-aXEN Avalanche fork suite passed `2/2`.

No XC contract has been deployed to Avalanche by this work. This document is a
readiness checkpoint, not a deployment record.

## Pinned Network Dependency

- network: Avalanche C-Chain Mainnet;
- chain ID: `43114`;
- native gas and Market payment currency: `AVAX`;
- aXEN: `0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389`;
- expected aXEN metadata: name `XEN Crypto`, symbol `aXEN`, decimals `18`.

The aXEN symbol matters. The Ethereum XEN deploy script expects `XEN`, while the
Avalanche contract reports `aXEN`. Avalanche uses a separate metadata guard.

The Solidity compiler remains `0.8.28` with `evmVersion: "cancun"`, optimizer
enabled with 200 runs and `viaIR: true`.

The Core and Stake contracts now use constructor-set immutable time parameters.
Ethereum and Avalanche therefore share one production implementation while
preserving separately verified, permanently fixed deployment profiles.

## Deployment Model Encoded by the Script

The prepared script represents this proposed deployment model:

- a new chain-native XC instance on Avalanche;
- a fresh Avalanche `GENESIS_TS` set by the Core deployment block;
- initial Core L1 nominal: `100 XNTD`;
- initial Core L1 burn: `100,000,000 aXEN`;
- Core nominal, Forge-bound and base-APR epoch: `60 days`;
- aXEN burn halving interval: `120 days`;
- Stake duration range: `10-240 days`;
- a new Avalanche XNTD contract controlled only by the Avalanche Core;
- no bridge mint authority and no multichain route activation in this deployment.

This is not silently assumed at execution time. The mainnet script requires a
separate `AVALANCHE_GENESIS_CONFIRM` phrase that explicitly names the fresh
genesis and all Avalanche-specific economic parameters.

If Avalanche XNTD must instead be bridge-linked to Ethereum XNTD, the current
production contracts and this deployment script are not sufficient. That is a
separate protocol design and security checkpoint.

## Prepared Files

### `scripts/preflight-avalanche.js`

Read-only check. It verifies chain ID `43114`, code at the pinned aXEN address,
aXEN name/symbol/decimals, and current provider block and fee data. It sends no
transaction and requires no private key.

### `test-fork/avalanche-xen.js`

Local Avalanche mainnet fork test. It validates the actual aXEN contract rather
than MockXEN: code and metadata, allowance, `burn(address,uint256)` callback
compatibility, successful `Core.mintWithXEN()`, and the resulting Core L1 data.

The default impersonated holder was taken from the Snowtrace aXEN holders page
on 2026-08-13 and can be replaced through `AVALANCHE_XEN_WHALE` if its balance
moves.

### `scripts/deploy-avalanche.js`

Mainnet-only deployment script with these safety controls:

- unique Avalanche deploy confirmation;
- separate fresh-genesis confirmation;
- separate irreversible wiring/rights-burn confirmation;
- exact chain ID guard;
- clean Git working tree requirement;
- source commit and branch captured in a runtime manifest;
- nonzero deployer AVAX balance check;
- real aXEN code and metadata checks;
- three confirmations per transaction by default;
- manifest update after every deployment and wiring transaction;
- explicit off-chain handshake before `Core.init()`;
- final no-admin and Forge-binding checks.

The script deploys in this order:

1. Core;
2. XNTD;
3. Stake;
4. Forge;
5. Market;
6. NFT Lens;
7. Core tokenURI Lens;
8. Stake tokenURI Lens;
9. Core tokenURI wiring;
10. Stake tokenURI wiring, which burns Stake deployer rights;
11. pre-init handshake;
12. `Core.init()`, which binds Forge in XNTD and burns Core deployer rights.

Runtime manifests are written under `deployment-records/avalanche-mainnet/` and
are ignored by Git. They contain public addresses and transaction hashes, but
must still be reviewed before a sanitized final deployment record is published.

If a deployment stops part-way, do not automatically rerun the script. Preserve
the manifest, inspect every completed transaction and decide whether to resume
manually or abandon those uninitialized contracts.

### `scripts/profile-avalanche-deployment-gas.js`

Deploys the full eight-contract topology plus both tokenURI wiring transactions
and `Core.init()` on a local Avalanche mainnet fork. It reports per-transaction
and total gas plus a sampled AVAX estimate. It sends no mainnet transaction.

With `AVALANCHE_PROFILE_LOCAL_ONLY=1`, the same deployment ceremony can be
measured deterministically without an RPC. This validates deployment gas units
and wiring topology but does not replace the final real-aXEN fork run or a fresh
live fee quote.

The pre-immutable-profile 2026-08-13 fork run measured `18,171,361` total gas.
The final published immutable-profile fork run measured `18,478,023` total gas
for all eleven transactions. The final real-aXEN integration fork passed both
metadata and `Core.mintWithXEN()` burn-callback tests. The read-only preflight
sampled `60,565,443` wei gas price. The Hardhat fork environment returned an
internal fee quote of `1,043,692,411` wei and estimated about `0.01929 AVAX`.
Gas units are the useful stable result; the ceremony budget must use fresh live
fee data and an explicit safety margin.

### `scripts/check-avalanche.js`

Post-deployment read-only verification checks code at aXEN and all eight XC
addresses, complete wiring, burned deployer rights, Forge binding, immutable
economic values, halving intervals, genesis timestamp and current protocol reads.

Set `AVALANCHE_EXPECT_FRESH_DEPLOYMENT=1` during the immediate post-deploy check
to also require an empty Market with `nextListingId == 1`.

### `scripts/verify-avalanche.js`

Runs the Hardhat verification sequence for all eight contracts with the exact
constructor arguments used by the deployment script. It treats an already
verified contract as success and stops on any other verification error.

## Environment Variables

Read-only preflight and post-deploy checks:

```text
AVALANCHE_RPC_URL=<reviewed Avalanche C-Chain RPC>
```

Fork test:

```text
AVALANCHE_RPC_URL=<reviewed Avalanche C-Chain RPC>
AVALANCHE_XEN_WHALE=<optional current holder with at least 100,000,000 aXEN>
```

Deployment additionally requires:

```text
AVALANCHE_DEPLOYER_PRIVATE_KEY=<dedicated deployer key>
AVALANCHE_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_DEPLOYS_XC_TO_AVALANCHE_MAINNET
AVALANCHE_GENESIS_CONFIRM=FRESH_AVALANCHE_GENESIS_100_XNTD_100M_AXEN_60D_120D_10D_240D
AVALANCHE_INIT_CONFIRM=BURN_DEPLOYER_RIGHTS_AND_FINALIZE_AVALANCHE_WIRING
AVALANCHE_CONFIRMATIONS=3
```

Never commit or print the RPC credentials or private key. The deployment key
must be dedicated to this operation and funded only with the AVAX required for
the reviewed deployment budget.

## Commands

```text
npm ci
npm test
npm run preflight:avalanche
npm run test:fork:avalanche
npm run profile:deploy:avalanche
npm run deploy:avalanche
npm run check:avalanche
npm run verify:avalanche
```

Do not run `npm run deploy:avalanche` until deployment is explicitly approved.
Use `npm ci`, not an unconstrained dependency refresh, for the reviewed lockfile.

## Remaining Mainnet Blockers

- prepare and fully test the Avalanche frontend before genesis;
- review and reduce the npm deployment-toolchain vulnerability surface;
- independently review the deploy and check scripts;
- complete external audit or explicitly record the decision to deploy without it;
- refresh live fee data and approve the AVAX deployment budget with margin;
- verify source code through the current Avalanche explorer flow;
- update frontend network configuration, addresses, ABI and native-currency labels;
- perform the immediate post-deploy read-only check before any public frontend is enabled.

## Market Currency Note

`XenchantedMarket` uses EVM native value through `msg.value`. On Ethereum this is
ETH; on Avalanche C-Chain it is AVAX. Existing source comments and identifiers
such as `priceWei` do not change runtime behavior, but Avalanche frontend and
documentation must display AVAX and must not label listings as ETH.

## Toolchain Checkpoint

The current repository uses Hardhat 2.x through the existing toolbox. A fresh
2026 full npm audit reports 68 vulnerable transitive development dependencies
(12 low, 22 moderate, 33 high and 1 critical). These are
not embedded into deployed Solidity runtime code, but they are relevant on the
machine that handles a deployment key. Do not apply an unreviewed bulk
`npm audit fix`: a toolchain migration must preserve compiler inputs and produce
reviewed bytecode before deployment. `npm audit --omit=dev` reports zero
runtime-dependency vulnerabilities at this checkpoint; the remaining findings
are in the development/deployment toolchain.
