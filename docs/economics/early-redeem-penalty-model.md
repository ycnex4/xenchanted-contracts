# Early Redeem Penalty Model

This document explores early stake redeem penalty options for xEnchanted Crypto.

## Current Rule

Current protocol rule:

- early redeem reward: `0`
- early redeem nominal penalty: `1%`
- matured redeem reward: full deterministic reward
- matured redeem nominal penalty: `0`
- no maturity claim deadline

Stake is not escrow. The original Core/Forged NFT is burned at stake start, a Stake NFT is minted, and the original NFT is recreated on redeem.

## Design Goal

The early redeem rule should balance:

- user flexibility;
- protection against abusing stake as a free option;
- clear and predictable UX;
- deterministic on-chain simplicity;
- first-principles/no-admin protocol rules.

## Option A — Keep Current 1% Flat Penalty

Rule:

- early redeem at any time before maturity:
  - reward = 0
  - nominal = original nominal - 1%

Benefits:

- simple;
- easy to explain;
- cheap to compute;
- gives users an emergency exit;
- avoids overly punitive UX;
- consistent with stake as time commitment but not permanent lock.

Risks:

- may be too soft;
- users can treat staking as a low-cost reversible option;
- large positions may accept 1% loss as cheap liquidity insurance.

Interpretation:

The main penalty is not only the 1% nominal cut, but also loss of all expected reward.

## Option B — 5% Flat Penalty

Rule:

- early redeem at any time before maturity:
  - reward = 0
  - nominal = original nominal - 5%

Benefits:

- stronger commitment;
- discourages casual early exits;
- makes stake more clearly time-bound.

Risks:

- can feel punitive;
- weakens user confidence when committing to long durations;
- emergency exit becomes expensive;
- may reduce staking participation.

## Option C — 10% Flat Penalty

Rule:

- early redeem at any time before maturity:
  - reward = 0
  - nominal = original nominal - 10%

Benefits:

- very strong lock-in;
- strongly protects stake maturity economics.

Risks:

- likely too punitive;
- users may avoid staking unless very confident;
- negative UX for mistakes or changed circumstances;
- could make staking feel like a trap rather than a voluntary time-value engine.

## Option D — Time-Weighted Sliding Penalty

Example rule:

- penalty starts higher near stake start;
- penalty decreases linearly toward 0 at maturity;
- reward remains 0 until maturity.

Example:

- max early penalty: 5%
- penalty at halfway point: 2.5%
- penalty just before maturity: near 0%

Benefits:

- economically intuitive;
- rewards users for staying longer even if they exit early;
- discourages immediate abuse more than late exit;
- feels fair.

Risks:

- more complex UX;
- more complex on-chain calculation;
- more edge cases;
- users may optimize exits around penalty curves;
- harder to explain than a flat rule.

## Option E — Reward Forfeiture Only

Rule:

- early redeem:
  - reward = 0
  - nominal penalty = 0

Benefits:

- very user-friendly;
- simplest mental model.

Risks:

- stake becomes almost free optionality;
- users can enter stake and exit with no principal cost;
- weakens the meaning of time commitment.

## Comparison

| Option | Simplicity | User Flexibility | Economic Commitment | UX Risk |
| --- | --- | --- | --- | --- |
| 1% flat | High | High | Medium | Low |
| 5% flat | High | Medium | High | Medium |
| 10% flat | High | Low | Very High | High |
| Sliding | Medium | Medium/High | High | Medium |
| Reward forfeiture only | Very High | Very High | Low | Low |

## Current Preferred Direction

Keep the current `1%` flat early nominal penalty for now.

Rationale:

- reward forfeiture is already a meaningful penalty;
- 1% nominal cut creates real cost without making stake feel dangerous;
- simple deterministic rule is easier to explain and audit;
- no additional contract complexity;
- no urgent evidence that a stronger penalty is required.

## Recommendation

Do not change the contract at this stage.

Document the current rule clearly in protocol docs and frontend:

- early redeem gives no reward;
- early redeem recreates the original NFT with 1% lower nominal;
- maturity redeem gives full reward and no nominal penalty;
- there is no deadline after maturity.

