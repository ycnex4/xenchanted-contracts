# Avalanche Partial Deployment Recovery Runbook

## Purpose

This runbook covers an interrupted Avalanche C-Chain deployment recorded by
`scripts/deploy-avalanche.js`. It is an emergency procedure, not an automatic
resume mode.

The deployment manifest under
`deployment-records/avalanche-mainnet/` is the source of truth for public
contract addresses and completed transaction hashes. Preserve it before any
investigation. Never restart the full deploy script against an existing partial
deployment: it creates a new topology rather than resuming the old one.

No partial topology may be published to the frontend.

## First response

1. Stop all deployment commands.
2. Preserve the manifest and the complete terminal output.
3. Record the latest confirmed block and deployer public address.
4. Check every recorded transaction in the Avalanche explorer.
5. Require deployed code at every recorded contract address.
6. Compare the manifest source commit, chain ID, aXEN dependency, constructor
   arguments and deployer address with the reviewed checkpoint.
7. Determine the exact recovery state using read-only calls.
8. Do not send a recovery transaction until a second reviewer confirms the
   state and intended next step.

A reverted transaction is atomic. Do not infer that a state change happened
from a submitted hash alone; require a successful receipt and verify the
resulting on-chain getter.

## State classification

| State | Required observations | Action |
| --- | --- | --- |
| Incomplete contract set | Fewer than all eight reviewed contract addresses have successful deployment receipts | Abandon this candidate topology. Do not publish it or deploy missing pieces ad hoc. Start a separately reviewed fresh deployment later. |
| Eight contracts, no lens wiring | All eight contracts have code; Core and Stake lens getters are zero; Core and Stake deployer getters equal the dedicated deployer | Run the full read-only constructor/wiring handshake. After reviewer approval, set the Core lens, then the Stake lens, then re-check before Core init. |
| Core lens only | Core lens equals the recorded Core lens; Stake lens is zero; both deployer getters still equal the dedicated deployer | Verify every constructor link and lens source. After reviewer approval, set the recorded Stake lens and re-check the pre-init state. |
| Both lenses, Core not initialized | Both lens getters match the recorded lens contracts; Stake deployer is zero; Core deployer is the dedicated deployer; Core initialized and XNTD forgeBound are false | This is the tested recovery point. Complete the mandatory handshake, then send only `Core.init(recordedXNTD, recordedStake, recordedForge)`. |
| Core initialized | Core initialized and XNTD forgeBound are true; both deployer getters are zero | Never call init or lens setters again. Run the complete post-deploy checker. |
| Any inconsistent state | Wrong code, address, immutable, lens, deployer, initialization or Forge-binding value | Stop and abandon the candidate until the discrepancy is independently explained. Do not improvise a repair. |

## Mandatory handshake before any recovery write

All comparisons are exact and case-insensitive for addresses.

- chain ID is `43114`;
- aXEN dependency is
  `0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389`;
- code exists at all eight recorded addresses;
- Core aXEN, initial nominal, initial aXEN burn and both halving intervals match
  the reviewed Avalanche profile;
- XNTD points to Core and is not Forge-bound before init;
- Stake points to Core and exposes the reviewed 10–240 day range;
- Forge points to the recorded Core and XNTD;
- Market points to the recorded Core;
- NFT Lens points to the recorded Core and Stake;
- both tokenURI lenses point back to their recorded Core or Stake source;
- any nonzero lens getter exactly matches the corresponding recorded lens;
- Core is not initialized before the final init transaction;
- Core deployer still equals the dedicated deployer before init;
- Stake deployer is either the dedicated deployer before its lens transaction
  or zero after that transaction—no other value is acceptable.

## Tested recovery point

`test/avalanche.deployment-recovery.js` reproduces the highest-risk normal
interruption point:

1. all eight contracts are deployed;
2. both tokenURI lenses are wired;
3. Stake deployer rights are already burned;
4. Core is not initialized and XNTD is not Forge-bound;
5. the process reconnects using only recorded public addresses;
6. every handshake value is checked;
7. only Core init is sent;
8. Core and Stake deployer rights are zero and XNTD Forge binding is final;
9. a repeated init attempt is rejected.

This test validates the procedure, but a live incident still requires manual
receipt review and independent approval because gas, RPC and transaction-order
failures are external to the local test.

## Completion

After the recovery transaction is confirmed:

1. set the manifest status to complete only after all final getters pass;
2. run `scripts/check-avalanche.js` with the exact recorded addresses and
   `AVALANCHE_EXPECT_FRESH_DEPLOYMENT=1`;
3. verify the eight contract sources;
4. publish a sanitized deployment record;
5. update the frontend only from the completed, independently checked address
   set.

If any completion check fails, keep the frontend disabled and treat the
deployment as incomplete.
