# Forge Cap Impact Model

This document explores the economic impact of the Forge min/max bounds in xEnchanted Crypto.

## Current Rule

Current Forge bounds:

- minimum forged nominal per act: `currentBaseNominal * 5`
- maximum forged nominal per act: `currentBaseNominal * 1000`

The bounds are based on the current epoch base nominal, not on a fixed historical value.

Forge requires:

- XNTD burn;
- Core L1 sacrifice;
- forged nominal derived from the XNTD burn amount;
- bounds enforced per forge act.

## Design Goal

Forge bounds should balance:

- meaningful XNTD burn demand;
- protection from extremely cheap low-value Forged NFT spam;
- whale participation without unlimited one-act concentration;
- simple deterministic epoch-based rules;
- clean frontend explanation.

## Why The Minimum Exists

The minimum Forge amount prevents very small XNTD burns from creating many low-value Forged NFTs.

Without a meaningful minimum:

- users could create many tiny Forged NFTs;
- the Forged category would become less significant;
- Core L1 sacrifice could become a cheap bypass into Forged identity;
- frontend inventory and protocol meaning could become noisy.

The current `base * 5` minimum makes Forge a more serious action than Core L1 mint.

## Why The Maximum Exists

The maximum Forge amount limits how much nominal can be created in a single forge act.

Without a cap:

- one large user could create extremely concentrated Forged NFTs;
- a single transaction could dominate the Forged nominal distribution;
- extreme outlier NFTs could distort protocol perception.

The current `base * 1000` cap still allows meaningful whale participation, but bounds one-act concentration.

## Scenario A — Max = Base * 100

Benefits:

- stronger cap on whale concentration;
- more distributed Forge activity;
- whales must split activity across more Forge acts.

Risks:

- may feel too restrictive for serious participants;
- reduces the usefulness of Forge as a strong XNTD sink;
- may force unnecessary transaction splitting;
- weakens the role of high-value Forged NFTs.

Interpretation:

A 100x cap is conservative, but may underuse Forge as a major XNTD burn pathway.

## Scenario B — Max = Base * 500

Benefits:

- balanced cap;
- still limits extreme one-act concentration;
- allows larger burns than 100x;
- may produce healthier high-value Forged NFT distribution.

Risks:

- still less powerful as a whale sink than 1000x;
- may be an arbitrary middle value;
- may require more explanation if changed from the current design.

Interpretation:

A 500x cap is a reasonable alternative if future modeling shows 1000x is too permissive.

## Scenario C — Max = Base * 1000

Benefits:

- strong XNTD sink;
- allows meaningful high-value Forge activity;
- supports whale participation without unlimited one-act minting;
- simple and already implemented;
- aligns with the current intended design.

Risks:

- allows large Forged NFTs;
- higher one-act concentration than 100x or 500x;
- distribution may become more top-heavy if whales use the full cap.

Interpretation:

A 1000x cap is aggressive, but still bounded. It gives Forge enough economic weight to matter as a major XNTD burn path.

## Scenario D — No Max Cap

Benefits:

- maximum flexibility;
- no artificial ceiling for large users;
- strongest possible one-act burn sink.

Risks:

- unbounded one-act concentration;
- extreme whale NFTs;
- harder to reason about distribution;
- weaker protection against protocol optics problems.

Interpretation:

No cap is not preferred. A deterministic maximum is healthier for protocol structure.

## Comparison

| Max Cap | Whale Access | Burn Sink Strength | Distribution Protection | UX Simplicity |
| --- | --- | --- | --- | --- |
| 100x | Low/Medium | Medium | High | High |
| 500x | Medium/High | High | Medium/High | High |
| 1000x | High | Very High | Medium | High |
| No cap | Unlimited | Maximum | Low | High |

## Current Baseline

The current baseline remains:

- min = `currentBaseNominal * 5`
- max = `currentBaseNominal * 1000`

This is not treated as a final irreversible economic conclusion in this document. It is the current implemented baseline that should remain unchanged unless deeper modeling shows a better parameter set.

## Rationale For Keeping The Baseline For Now

The `base * 5` minimum makes Forge a serious protocol action.

The `base * 1000` maximum preserves strong XNTD burn utility while preventing unlimited one-transaction concentration.

The cap is intentionally high enough to allow meaningful whale participation, but still deterministic and bounded.

## Further Modeling Needed

Before mainnet deployment, this parameter should be revisited with deeper numerical modeling of:

- whale behavior;
- XNTD burn demand;
- number of Forge acts required under different caps;
- Forged NFT nominal distribution;
- effect of 100x, 500x, and 1000x caps across multiple epochs;
- whether a lower cap creates healthier distribution without weakening Forge as an XNTD sink.

## Recommendation

Do not change the contract at this stage.

Document the current rule clearly in protocol docs and frontend:

- Forge has an epoch-based minimum and maximum.
- The minimum prevents tiny Forged NFT spam.
- The maximum limits one-act concentration.
- Both values move with the current epoch base nominal.

Revisit the max cap after deeper numerical modeling.

