# Mainnet Fork Test — Real XEN Integration

Status: completed  
Scope: real Ethereum XEN integration for `xEnchantedNFT.mintWithXEN()`

## Purpose

The local unit and integration test suite uses `MockXEN` for deterministic testing. To reduce external dependency risk, a dedicated Hardhat mainnet fork test was added to validate the mint flow against the real Ethereum XEN contract.

Real XEN contract:

`0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8`

## What was tested

The fork test verifies:

- real XEN metadata and 18-decimal configuration;
- deployment of xEnchanted Core using the real XEN contract address;
- user XEN funding on forked mainnet state through account impersonation;
- required XEN allowance from the user to Core before `mintWithXEN()`;
- successful `Core.mintWithXEN()` execution against the real XEN burn flow;
- correct Core L1 state after mint, including:
  - `level`;
  - `isForged`;
  - `nominal`;
  - `xenBurned`;
  - `xntdBurned`.

## Result

Passed.

Command:

`npx hardhat test test-fork/mainnet-xen.js`

Observed result:

`2 passing`

## Important finding

The real XEN burn path requires ERC-20 allowance from the user to the Core contract before `mintWithXEN()` can execute successfully.

As a result:

- `MockXEN` was updated to require allowance before burning tokens from a user;
- local tests were updated to approve XEN before successful `mintWithXEN()` calls;
- a negative local test was added to confirm that `mintWithXEN()` reverts without XEN allowance;
- the local test suite now reflects the real XEN allowance behavior.

Observed local result:

`70 passing`

## Security interpretation

This test reduces external dependency integration risk by validating the critical XEN burn path against the real deployed XEN contract on a local mainnet fork.

It does not replace:

- independent third-party audit;
- formal verification;
- full mainnet launch readiness review.
