xEnchanted Crypto — Production Contract Audit Checkpoint

Status



Current contract refactor checkpoint is stable.



Latest confirmed local test suite: 70 passing.

Latest confirmed mainnet fork XEN integration test: 2 passing.

Working tree after checkpoint: nothing to commit, working tree clean.



Post-Theo security hardening checkpoint

This checkpoint was updated after external review feedback from Theo.

Important clarification:

This document is not an independent third-party audit and is not formal verification.

It is an internal smart contract security and protocol integrity review checkpoint supported by additional static analysis, local tests, and mainnet fork integration testing.

Security hardening completed after review feedback:

Slither 0.11.5 production-filtered static analysis was run.

Initial production-filtered Slither result: 111 findings.

Final production-filtered Slither result: 81 findings.

Final Slither high issues: 0.

Remaining Slither findings were manually triaged and documented in:

docs/security/slither-triage.md

Remediated findings include:

unused helper functions removed.

redundant statements removed.

unused Forge burn hook return value removed.

Forge public entry point hardened with nonReentrant.

tokenURI bytes concatenation changed from abi.encodePacked(a, b, c) to bytes.concat(a, b, c).

Init event address parameters indexed.

Accepted/documented findings include:

partial tuple usage in view/preview functions.

staticcall usage in read-only lens/tokenURI/init handshake flows.

batch view external call inside loop.

timestamp usage for epochs, APR decay and staking maturity.

strict equality invariant/sentinel checks.

remaining reentrancy-pattern warnings for trusted one-time wiring and protocol flows.

missing-inheritance style suggestions.

naming-convention style suggestions.

divide-before-multiply in the intentional Core enchant nominal formula.

Real XEN integration checkpoint:

A Hardhat mainnet fork test was added and executed against the real Ethereum XEN contract:

0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8

The fork test confirmed:

real XEN metadata and 18-decimal configuration.

Core deployment using the real XEN address.

required XEN allowance from user to Core before mintWithXEN.

successful mintWithXEN execution against the real XEN burn flow.

correct Core L1 state after mint.

Result: 2 passing.

Important finding:

Real XEN requires ERC20 allowance before Core.mintWithXEN can burn the user's XEN.

MockXEN and local tests were updated to match this real-XEN behavior.

A negative local test now confirms that mintWithXEN reverts without XEN allowance.

Details:

docs/security/mainnet-fork-xen.md



Production refactor completed

1\. Staking lifecycle



Final staking model:



Original NFT burn → Stake NFT mint with same tokenId → Stake NFT redeem → Original artifact reminted/recreated with same tokenId.



Important rules:



L1 Core cannot be staked.

L1 Forged cannot be staked.

Stake is available only for level >= 2.

Stake position is transferable.

Current owner of stake NFT controls redeem.

Current owner receives recreated artifact and available reward.



Reward views were split:



expectedReward = deterministic reward at maturity.

availableReward = reward redeemable now.



Active stake:



expectedReward > 0.

availableReward = 0.



Matured stake:



expectedReward > 0.

availableReward = expectedReward.



Early redeem:



reward = 0.

original artifact reminted with same tokenId and level.

nominal reduced by 1% using ceil rounding.



Matured redeem:



reward paid once.

original artifact reminted with same tokenId, level and nominal.

no claim deadline after maturity.



2\. Stake metadata



Stake token metadata now reads canonical StakeView data.



Metadata reflects:



ExpectedReward.

AvailableReward.

EarlyRedeemNominal.

MaturityRedeemNominal.

BaseAPR\_BPS.

LevelBonus\_BPS.

ForgedBonus\_BPS.

TotalAPR\_BPS.



3\. Forge production economy



Forge final bounds:



minForgeAmount = currentBaseNominal \* 5.

maxForgeAmount = currentBaseNominal \* 1000.



Forged NFT nominal:



nominal = XNTD burned.



Forge requires:



ordinary Core L1.

current epoch L1 logic enforced by Core.

XNTD burn.



Forge no longer requires ERC20 approve.



Old flow:



approve XNTD → forge.



New flow:



forge.



4\. XNTD protocol-only burn paths



XNTD has no public self-burn.



No function:



burn(uint256 amount)



Supported burn paths:



XEN-style integrator burn



burn(address user, uint256 amount)



Requires:



msg.sender is contract.

msg.sender supports IXNTDBurnRedeemable via ERC165.

user has allowance for msg.sender.



Flow:



integrator calls XNTD.burn(user, amount).

XNTD spends allowance.

XNTD burns user tokens.

XNTD records burn counters.

XNTD calls integrator.onXNTDBurned(user, amount).



Forge-only burn



burnForForge(address user, uint256 amount)



Rules:



only bound Forge can call it.

no allowance required.

used only inside forge().



5\. XNTD mint policy



XNTD mint is allowed only from Core.



No owner/admin mint path.



XNTD supply source:



NFT redeem.

stake matured reward through Core.



No premine.

No reserve mint.

No founder allocation.



6\. Production genesis constants



Production genesis config:



INITIAL\_NOMINAL = 100 XNTD.

INITIAL\_XEN\_BURN = 100,000,000 XEN.



Ratio:



100,000,000 XEN burned -> Core L1 with 100 XNTD nominal.

1 XNTD nominal : 1,000,000 XEN burned.



These values are passed into Core constructor and are immutable for the deployment.



7\. Lens/Core truth alignment



NFT Lens was aligned with Core truth.



Important fixes:



xntdBurned added to view data.

mixed Core/Forged enchant is invalid.

previewEnchant follows Core logic.

protocol params exposed through Lens.



Frontend should avoid hardcoding protocol parameters and read them from Core/Lens.



8\. Artifact burn footprint



NFT data stores real burn footprint:



nftData\[tokenId].xenBurned

nftData\[tokenId].xntdBurned



Core lineage:



xenBurned accumulates from Core parents.



Forged lineage:



xntdBurned accumulates from Forged parents.



This means high-level NFTs created from artifacts across different epochs preserve their real historical burn footprint.



9\. Enriched lifecycle events



Core events were enriched for indexer/live-feed/statistics.



Important event data now includes:



Minted:

xenBurned

xntdBurned



Enchanted:

owner

xenBurned

xntdBurned



Redeemed:

forged

level

nominal

xntdMinted



StakeBurn:

forged

level

nominal



Phoenix:

forged

level

reward

nomAfter



ForgeMint:

xntdBurned



This allows future indexers to reconstruct artifact lifecycle and burn history without extra state calls.



10\. No-admin / immutable wiring



Covered by tests:



Core.init cannot run without URI lens.

failed init does not bind Forge in XNTD.

Core.init is one-time.

Core deployer rights are burned after init.

Core tokenURI lens cannot be changed after init.

Stake tokenURI lens cannot be changed after set.

XNTD Forge binding cannot be called by deployer.

XNTD Forge binding cannot be repeated even by Core address.

deployer cannot mint XNTD.

deployer cannot use Forge-only burn path.

Core / XNTD / Stake / Forge wiring points to intended contracts.



11\. Deploy script status



Current Sepolia deploy script is correct for testnet/dev.



It uses:



MockXEN.

production genesis constants.

URI lenses before Core.init.

Core.init after wiring.

verified genesis config logs.



Important future mainnet change:



MockXEN must not be deployed to mainnet.

Real Ethereum XEN address must be used.

Mint L1 must account for real XEN allowance behavior: user must approve Core before mintWithXEN if allowance is insufficient.



Suggested future file:



scripts/deploy-mainnet.js



Mainnet deploy script should:



not deploy MockXEN.

use real XEN address.

use same production constants.

deploy Core / XNTD / Stake / Forge / Lens.

set URI lenses before init.

call Core.init once.

verify genesis config.

verify XNTD.FORGE.

verify no-admin wiring.



Current commits



Important checkpoint history:



docs: add frontend migration notes for production contracts.

refactor: enrich artifact lifecycle events.

test: cover no-admin protocol wiring invariants.

refactor: add protocol-only XNTD burn paths.

chore: set production genesis constants.

refactor: enforce production forge bounds.

refactor: align NFT lens with core protocol truth.

refactor: align stake token metadata with reward views.

refactor: align staking with production lifecycle.

chore: snapshot contracts before production refactor.



Frontend migration required



See:



docs/contract-frontend-migration.md



Key frontend tasks:



update ABIs.

update StakeView decoding.

show Expected Reward and Available Reward.

disable L1 stake.

remove Forge approve flow.

add/verify Mint L1 XEN approve flow when allowance is insufficient.

update Forge min/max validation.

read production XEN burn amount from contract/Lens.

add xntdBurned to Core/Forged asset views.

update event decoding if indexer/live feed is added.



Remaining work

Contract-side



Before mainnet:



create deploy-mainnet.js using real XEN address.

run full local test suite.

run mainnet fork XEN integration test.

optionally add deployment verification script.

review bytecode size.

review gas-sensitive flows.

review frontend ABI compatibility.



Frontend-side



Required:



update generated ABI files.

update on-chain types.

remove Forge approve UX.

update StakeView / previewRedeem decoding.

update Lens reads.

update Assets / Vault details.

update Mint production XEN burn display.

run lint/build.



Future optional work



Protocol Live Feed.

Stats page.

Indexer.

Charts/distributions.

Mainnet deployment checklist.

Independent external audit.

Formal verification / invariant testing expansion.



Final design statement



xEnchanted Crypto is now aligned with the intended production model:



Value is created by user action,

transformed through immutable protocol rules,

represented by artifacts,

and never distributed from an allocation pool.

