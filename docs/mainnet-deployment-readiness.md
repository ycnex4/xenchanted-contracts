# Mainnet Deployment Readiness

This document records the mainnet deployment preparation workflow for xEnchanted Crypto contracts.

## Status

Mainnet deployment scripts are prepared for review, but mainnet deployment is not being executed at this stage.

This is a readiness document, not a deployment record.

## Mainnet Safety Rules

Mainnet deployment must follow these rules:

- use the real Ethereum XEN contract;
- never deploy or wire MockXEN on mainnet;
- verify chain ID before deployment;
- require explicit deployment confirmation;
- do not print private keys, RPC URLs, API keys, or secrets;
- verify post-deploy wiring before frontend integration;
- keep deployment addresses recorded and reviewed before publication.

## Real Ethereum XEN

Mainnet XEN address:

0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8

The deployment script checks real XEN metadata before deploying Core:

- symbol: XEN;
- decimals: 18.

Core must be deployed with this XEN address as immutable constructor input.

## Prepared Scripts

### scripts/deploy-mainnet.js

Purpose:

- deploy Core using real Ethereum XEN;
- deploy XNTD;
- deploy Stake;
- deploy Forge;
- deploy Market;
- deploy read-only Lens contracts;
- set Core tokenURI lens;
- set Stake tokenURI lens;
- call Core init;
- print public deployed addresses for follow-up verification.

Safety controls:

- refuses to run unless MAINNET_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_DEPLOYS_TO_MAINNET;
- refuses to run unless chainId == 1;
- does not deploy MockXEN;
- does not print secrets.

### scripts/check-mainnet.js

Purpose:

- verify deployed contract wiring on Ethereum mainnet;
- verify Core is bound to the real XEN address;
- verify Core/XNTD/Stake/Forge/Market/Lens references;
- verify deployer rights are burned where expected;
- print protocol parameters for public review.

Checks include:

- Core.XEN == real Ethereum XEN;
- Core.XNTD == XNTD;
- Core.STAKING == Stake;
- Core.FORGE == Forge;
- Core.TOKEN_URI_LENS == TokenURILens;
- Core.initialized == true;
- Core.DEPLOYER == address(0);
- Stake.CORE == Core;
- Stake.TOKEN_URI_LENS == StakeTokenURILens;
- Stake.DEPLOYER == address(0);
- XNTD.CORE == Core;
- XNTD.FORGE == Forge;
- XNTD.forgeBound == true;
- Forge.CORE == Core;
- Forge.XNTD == XNTD;
- Market.CORE == Core;
- Market.MAX_PAGE_SIZE == 100;
- Market.activeListingCount == 0;
- Market.nextListingId == 1;
- Lens source addresses.

## Mainnet Deployment Command Shape

Do not run this command until mainnet deployment is intentionally approved.

PowerShell command shape:

$env:MAINNET_DEPLOY_CONFIRM="I_UNDERSTAND_THIS_DEPLOYS_TO_MAINNET"
npx hardhat run .\scripts\deploy-mainnet.js --network mainnet

The .env file must contain the required RPC/private key values for Hardhat, but secrets must not be printed or committed.

## Post-Deploy Check Command Shape

After deployment, set the public contract addresses as environment variables and run:

npx hardhat run .\scripts\check-mainnet.js --network mainnet

The check script requires:

- CORE_ADDRESS;
- XNTD_ADDRESS;
- STAKE_ADDRESS;
- FORGE_ADDRESS;
- MARKET_ADDRESS;
- NFT_LENS_ADDRESS;
- TOKEN_URI_LENS_ADDRESS;
- STAKE_TOKEN_URI_LENS_ADDRESS.

These are public deployed contract addresses, not secrets.

## Required Pre-Deploy Checks

Before mainnet deployment:

- run full local test suite;
- run real XEN mainnet fork integration test;
- run local gas profile;
- run real XEN gas profile;
- review bytecode size;
- review deployment scripts;
- review Market v1 design and gas profile;
- verify Hardhat network configuration uses Ethereum mainnet;
- verify deployer wallet and ETH balance;
- verify no MockXEN path is used;
- verify frontend ABI compatibility.

## Required Post-Deploy Checks

After deployment:

- run scripts/check-mainnet.js;
- save deployed public addresses;
- verify contract source on Etherscan if appropriate;
- update frontend addresses and ABIs;
- run frontend build;
- verify Mint L1 allowance flow against real XEN;
- verify read-only Lens calls;
- verify Market read-only calls;
- verify tokenURI rendering;
- verify no admin/deployer rights remain where they should be burned.

## Current Conclusion

The repository now has a mainnet deployment preparation path, but actual mainnet deployment remains a separate explicit action.
