# Real XEN Mainnet Fork Gas Profile

This document records a focused gas profile for `mintWithXEN()` against the real Ethereum XEN contract on a local Hardhat mainnet fork.

## Context

The local gas profile in `gas-profiling-results.md` uses `MockXEN` and focuses on protocol flow comparison and flat gas-scaling validation by level and nominal magnitude.

This document is different. It measures the real XEN approval and burn/callback path on a mainnet fork.

## Environment

- Network: local Hardhat mainnet fork
- XEN contract: `0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8`
- Receiver type: EOA wallet
- XEN source: impersonated XEN holder on local fork
- Initial nominal: 100 XNTD
- Initial XEN burn: 100,000,000 XEN
- Solidity optimizer: enabled
- Optimizer runs: 200
- EVM version: cancun
- viaIR: enabled

This profile does not send real mainnet transactions.

## Gas Profile Summary

| Flow | Gas Used |
| --- | ---: |
| Real XEN transfer whale -> user | 51,800 |
| Real XEN approve Core | 46,329 |
| Core mintWithXEN against real XEN | 240,502 |

## Notes

The XEN transfer from the impersonated holder to the local test user is measured for visibility, but it is not a protocol user flow.

The main user-facing sequence is:

1. user approves Core to spend XEN;
2. user calls `mintWithXEN()`;
3. Core calls real XEN `burn(user, amount)`;
4. real XEN spends allowance and burns XEN;
5. real XEN calls the burn callback;
6. Core validates the callback context and mints Core L1.

## Observations

The fork profile confirms that the current `mintWithXEN()` flow works against the real Ethereum XEN contract and its allowance-based burn behavior.

Measured protocol-relevant gas:

- Real XEN approve Core: 46,329 gas
- Core mintWithXEN against real XEN: 240,502 gas

This complements the local MockXEN profile. The two profiles should not be treated as directly identical because the XEN implementations and execution environments differ.

## Current Conclusion

The real XEN mainnet fork gas profile does not show a gas blocker for the `mintWithXEN()` entry flow.

The exact user cost still depends on mainnet gas price, wallet behavior, and whether approval is already set.

