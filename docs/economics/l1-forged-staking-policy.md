# L1 Forged Staking Policy

This document records the economic rationale for the current L1 Forged staking rule in xEnchanted Crypto.

## Current Rule

Current staking rule:

- Core L1 NFTs are not stakeable.
- Forged L1 NFTs are not stakeable.
- Staking requires `level > 1`.
- Forged NFTs receive an additional `+5% APR` bonus once they are stakeable.
- Therefore, the Forged staking bonus unlocks only at L2+.

## Context

A Forged NFT is created by burning XNTD and sacrificing a Core L1 NFT.

Because Forged NFTs already represent an XNTD-burn position, one possible question is whether Forged L1 NFTs should be stakeable immediately.

The current protocol does not allow this.

## Design Goal

The staking rule should preserve:

- staking as a reward for evolved NFTs;
- meaningful commitment before accessing yield;
- a clear separation between forge entry and stake yield;
- protection against immediate burn-to-yield loops;
- simple and deterministic protocol rules.

## Option A — Keep Current Ban For All L1 NFTs

Rule:

- Core L1: not stakeable.
- Forged L1: not stakeable.
- Core/Forged L2+: stakeable.

Benefits:

- very simple rule;
- staking is reserved for evolved NFTs;
- avoids immediate XNTD burn -> Forged L1 -> stake -> +5% APR path;
- makes the Forged APR bonus something users unlock through evolution;
- avoids special-case APR logic for L1 Forged NFTs.

Risks:

- Forged L1 users cannot stake immediately;
- some users may expect Forged NFTs to be stakeable because they already burned XNTD;
- frontend and docs must explain the rule clearly.

Interpretation:

This is an economic gate, not a technical limitation.

## Option B — Allow L1 Forged Staking With Full Forged Bonus

Rule:

- Core L1 remains not stakeable.
- Forged L1 becomes stakeable.
- Forged L1 receives the full `+5% APR` bonus.

Benefits:

- makes Forged L1 more immediately useful;
- increases staking participation;
- gives direct yield utility to XNTD burn.

Risks:

- users can burn XNTD into Forged L1 and immediately access the Forged staking bonus;
- weakens the role of enchant/evolution;
- may over-reward entry-level Forged NFTs;
- changes the meaning of L1 as a base state.

## Option C — Allow L1 Forged Staking Without Forged Bonus

Rule:

- Core L1 remains not stakeable.
- Forged L1 becomes stakeable.
- Forged L1 does not receive `+5% APR` until L2+.

Benefits:

- gives Forged L1 some utility;
- avoids immediate access to the full Forged bonus.

Risks:

- creates special-case logic;
- harder to explain;
- users may be confused why a Forged NFT does not receive the Forged bonus;
- more frontend and documentation complexity.

## Option D — Allow L1 Forged Staking With Reduced Bonus

Rule:

- Core L1 remains not stakeable.
- Forged L1 becomes stakeable.
- Forged L1 receives a reduced bonus, for example `+1%` or `+2%`.

Benefits:

- partial utility for Forged L1;
- softer transition into full Forged staking.

Risks:

- adds another parameter;
- complicates APR calculation;
- creates more economic surface area;
- weakens the clean rule that level progression unlocks stronger protocol utility.

## Comparison

| Option | Simplicity | Forged L1 Utility | Evolution Incentive | Economic Risk |
| --- | --- | --- | --- | --- |
| Keep L1 ban | High | Low | High | Low |
| Full bonus at L1 | High | High | Low | High |
| No bonus at L1 | Medium | Medium | Medium | Medium |
| Reduced bonus at L1 | Medium/Low | Medium | Medium | Medium |

## Current Preferred Direction

Keep the current ban:

- L1 Core is not stakeable.
- L1 Forged is not stakeable.
- Staking begins at L2+.
- Forged `+5% APR` bonus unlocks only once a Forged NFT is evolved to L2+.

## Rationale

This keeps staking aligned with NFT evolution.

Forging creates a stronger NFT category through XNTD burn, but staking yield should still require the NFT to move beyond its entry state.

The current rule avoids an immediate path where a user can:

1. burn XNTD;
2. mint a Forged L1;
3. stake immediately;
4. access the Forged APR bonus without evolution.

This makes the L1 staking ban an intentional economic gate.

## Recommendation

Do not change the contract at this stage.

Document the rule clearly in frontend and protocol docs:

- L1 NFTs are entry NFTs.
- Staking requires L2+.
- Forged NFTs receive their additional staking bonus only when stakeable.
- Therefore, Forged staking starts from L2+.

