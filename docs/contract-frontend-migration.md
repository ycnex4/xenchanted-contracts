# xEnchanted Crypto — Contract Production Refactor Frontend Migration Notes

This document records ABI and frontend-facing changes introduced by the production contract refactor.

Current contract checkpoint includes:

- production staking lifecycle;
- StakeView reward split;
- stake NFT metadata reward alignment;
- NFT Lens aligned with Core protocol truth;
- production Forge min/max bounds;
- production genesis constants;
- protocol-only XNTD burn paths;
- no-admin wiring invariant tests;
- enriched artifact lifecycle events.

## 1. Production genesis constants

Production deploy config:

```text
INITIAL_NOMINAL = 100 XNTD
INITIAL_XEN_BURN = 100,000,000 XEN
```

In `scripts/deploy-sepolia.js`:

```js
const INITIAL_NOMINAL = ethers.parseEther("100");
const INITIAL_XEN_BURN = ethers.parseEther("100000000");
```

Meaning:

```text
100,000,000 XEN burned -> Core L1 with 100 XNTD nominal
ratio: 1 XNTD nominal : 1,000,000 XEN burned
```

Frontend must stop assuming the old test value `10 XEN`.

## 2. Stake production lifecycle

L1 Core and L1 Forged NFTs cannot be staked.

Frontend must block/disable stake action for:

```text
level === 1
```

Stake is available only for:

```text
level >= 2
```

Stake position remains transferable. The current owner of the stake NFT controls redeem and receives:

```text
recreated/reminted original artifact
+
available XNTD reward, if matured
```

Recommended UI text:

```text
Stake positions are transferable. The current owner of the stake NFT controls redeem and receives the recreated artifact and any available reward.
```

Russian meaning:

```text
Stake position можно передать. Текущий владелец stake NFT контролирует redeem и получает заново созданный artifact и доступную reward.
```

## 3. StakeView target shape

The staking view is now frontend-oriented and separates expected reward from available reward.

Target fields:

```ts
type StakeView = {
  tokenId: bigint;
  owner: Address;
  isForged: boolean;
  level: number;
  nominal: bigint;
  startTs: number;
  endTs: number;
  durationDays: number;
  active: boolean;
  matured: boolean;
  baseAprBps: number;
  levelBonusBps: number;
  forgedBonusBps: number;
  totalAprBps: number;
  expectedReward: bigint;
  availableReward: bigint;
  earlyRedeemNominal: bigint;
  maturityRedeemNominal: bigint;
};
```

Semantics:

```text
active stake:
expectedReward > 0
availableReward = 0

matured stake:
expectedReward > 0
availableReward = expectedReward
```

Frontend must not display active stake reward as simply `0`. It should show:

```text
Expected Reward
Available Reward
```

## 4. previewRedeem changed

`previewRedeem(id)` now separates:

```text
expectedReward
availableReward
```

Frontend must update old tuple indexes.

Important UI semantics:

```text
availableReward = what can be minted if redeem is executed now
expectedReward = deterministic reward at maturity
```

Active stake:

```text
availableReward = 0
expectedReward > 0
```

Matured stake:

```text
availableReward = expectedReward
```

## 5. Early redeem nominal

Early redeem nominal is now consistently calculated with Core-compatible ceil rounding:

```text
ceil(nominal * 9900 / 10000)
```

This represents a 1% nominal penalty.

Frontend should use contract/Lens values, not duplicate calculation unless only for optimistic display.

## 6. Stake token metadata

`xEnchantedStakeTokenURILens` now reads canonical `StakeView` data.

Stake NFT metadata should reflect:

```text
ExpectedReward
AvailableReward
EarlyRedeemNominal
MaturityRedeemNominal
BaseAPR_BPS
LevelBonus_BPS
ForgedBonus_BPS
TotalAPR_BPS
```

## 7. Forge production economy

Forge bounds changed:

```text
minForgeAmount = currentBaseNominal * 5
maxForgeAmount = currentBaseNominal * 1000
```

Frontend must update Forge validation and previews.

Forge amount is based on current epoch `currentBaseNominal`.

Forged NFT nominal:

```text
nominal = XNTD burned
```

## 8. Forge no longer requires ERC20 approve

The old Forge UX had:

```text
approve XNTD
forge
```

The new production Forge UX is:

```text
forge
```

No ERC20 allowance/spending cap is required.

Frontend must remove:

```text
XNTD approve step
allowance check for Forge
MetaMask spending cap prompt
```

The Forge contract now calls:

```solidity
XNTD.burnForForge(msg.sender, xntdAmount)
```

Only the one-time-bound Forge contract can call this burn path.

## 9. XNTD burn paths

XNTD has no public self-burn.

There is no:

```solidity
burn(uint256 amount)
```

XNTD burn is protocol-contextual only.

Supported burn paths:

### 9.1 XEN-style integrator burn

```solidity
burn(address user, uint256 amount)
```

Requires:

```text
msg.sender is a contract
msg.sender supports IXNTDBurnRedeemable via ERC165
user has given allowance to msg.sender
```

Flow:

```text
integrator calls XNTD.burn(user, amount)
XNTD spends allowance
XNTD burns user tokens
XNTD records burn counters
XNTD calls integrator.onXNTDBurned(user, amount)
```

### 9.2 Forge-only burn

```solidity
burnForForge(address user, uint256 amount)
```

Only bound Forge can call it.

No ERC20 approval is required.

## 10. XNTD frontend-readable fields

New or important XNTD views:

```solidity
CORE()
FORGE()
forgeBound()
totalBurned()
forgeBurned()
userBurns(address)
integratorBurns(address)
```

Events:

```solidity
event ForgeBound(address indexed forge);
event XNTDMinted(address indexed to, uint256 amount);
event XNTDBurned(address indexed user, address indexed burner, uint256 amount, BurnKind kind);
```

## 11. Lens changes

`xEnchantedNFTLens` was aligned with Core truth.

Frontend should use Lens for protocol params and artifact data instead of hardcoding.

Important changes:

```text
xntdBurned added to Core/Forged view data
previewEnchant follows Core.previewEnchant truth
mixed Core/Forged enchant is not previewed as successful
protocol params exposed via Lens
```

Protocol params should be read from Lens/Core instead of hardcoded:

```text
genesisTs
halvingInterval
xenBurnHalvingInterval
currentEpoch
nextHalvingTs
initialNominal
currentBaseNominal
initialXenBurn
currentXenBurnAmount
enchantMultiplier
maxLevel
baseAprBpsNow
bpsDenom
earlyPenaltyBps
maxWalletNfts
```

Protocol halving note:

- `halvingInterval` remains the 180-day protocol epoch interval used for `currentEpoch`, `currentBaseNominal`, `nextHalvingTs`, and rules derived from `currentBaseNominal` such as Forge bounds.
- `xenBurnHalvingInterval` is a separate 360-day interval used only by `currentXenBurnAmount`.
- Frontend code must not assume that XEN burn decay and protocol/base nominal decay use the same interval.

## 12. Enchant preview truth

Mixed Core/Forged enchant is invalid.

Frontend must not show mixed Core/Forged enchant as successful.

Expected UX:

```text
Core + Core -> Core
Forged + Forged -> Forged
Core + Forged -> invalid
```

## 13. Artifact lifecycle events changed

Core events were enriched for indexer/live-feed/statistics.

### Minted

```solidity
event Minted(
    uint256 indexed id,
    address indexed to,
    uint8 lvl,
    uint256 nom,
    bool forged,
    uint256 xenBurned,
    uint256 xntdBurned
);
```

Meaning:

```text
Core L1:
xenBurned = actual XEN burned
xntdBurned = 0

Forged L1:
xenBurned = 0
xntdBurned = actual XNTD burned
```

### Enchanted

```solidity
event Enchanted(
    uint256 indexed id,
    uint256 indexed p1,
    uint256 indexed p2,
    address owner,
    uint8 lvl,
    uint256 nom,
    bool forged,
    uint256 xenBurned,
    uint256 xntdBurned
);
```

For high-level NFTs, burn footprint is accumulated from parent lineage:

```text
Core lineage:
xenBurned = parent1.xenBurned + parent2.xenBurned

Forged lineage:
xntdBurned = parent1.xntdBurned + parent2.xntdBurned
```

This is essential for artifacts created from NFTs across different epochs.

### Redeemed

```solidity
event Redeemed(
    uint256 indexed id,
    address indexed owner,
    bool indexed forged,
    uint8 level,
    uint256 nominal,
    uint256 xntdMinted
);
```

### StakeBurn

```solidity
event StakeBurn(
    uint256 indexed id,
    address indexed owner,
    bool indexed forged,
    uint8 level,
    uint256 nominal
);
```

### Phoenix

```solidity
event Phoenix(
    uint256 indexed id,
    address indexed to,
    bool indexed matured,
    bool forged,
    uint8 level,
    uint256 reward,
    uint256 nomAfter
);
```

### ForgeMint

```solidity
event ForgeMint(
    uint256 indexed id,
    address indexed to,
    uint256 nom,
    uint256 xntdBurned
);
```

## 14. Frontend action changes

### Mint

Use production burn amount from contract/Lens:

```text
currentXenBurnAmount
```

Do not hardcode `10 XEN`.

### Forge

Remove approve flow.

Use:

```text
minForgeAmount
maxForgeAmount
getForgeParams()
```

Display validation:

```text
minimum = currentBaseNominal * 5
maximum = currentBaseNominal * 1000
```

### Stake

Disable level 1.

Display:

```text
Expected Reward
Available Reward
APR breakdown
Early Redeem Nominal
Maturity Redeem Nominal
```

### Assets / Vault

Core/Forged detail views should show:

```text
XEN Burned
XNTD Burned
Parent 1
Parent 2
```

Stake detail views should show:

```text
Expected Reward
Available Reward
Redeem Result
Lifecycle note
Transferable position note
```

## 15. Suggested frontend migration order

1. Update contract ABIs.
2. Update generated/typed contract bindings.
3. Update Core/Forged asset mapper to include `xntdBurned`.
4. Update StakeView type and tuple decoding.
5. Update Stake UI labels: Expected Reward / Available Reward.
6. Disable L1 stake actions.
7. Remove Forge approve flow.
8. Update Forge min/max validation.
9. Update Mint UI to read production XEN burn amount.
10. Update event decoding/indexer assumptions.
11. Run `npm run lint`.
12. Run `npm run build` if available.
