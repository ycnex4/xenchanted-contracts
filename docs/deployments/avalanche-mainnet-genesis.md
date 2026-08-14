# Avalanche C-Chain Mainnet Genesis Deployment

## Canonical status

The chain-native xEnchanted Crypto instance was successfully deployed and
irreversibly finalized on Avalanche C-Chain Mainnet on 2026-08-14.

- status: `complete`;
- chain ID: `43114`;
- native currency: `AVAX`;
- deployment source commit:
  [`bd3847db8f23b8011db7c1c59eea6674357cbf30`](https://github.com/ycnex4/xenchanted-contracts/commit/bd3847db8f23b8011db7c1c59eea6674357cbf30);
- source branch at deployment: `main`;
- deployer: [`0xDE4148205f4a1f2597dcDe7912f1532B6f6E3A92`](https://snowtrace.io/address/0xDE4148205f4a1f2597dcDe7912f1532B6f6E3A92);
- genesis timestamp: `1786665631` (`2026-08-14T00:00:31Z`);
- completed at: `2026-08-14T00:06:53.060Z`;
- confirmations required per transaction: `3`.

This file is the human-readable canonical record. The exact completed runtime
manifest is preserved in
[`avalanche-mainnet-genesis.json`](avalanche-mainnet-genesis.json).

Later documentation commits do not change the deployed bytecode source
checkpoint above.

## Pinned dependency and immutable launch profile

- official aXEN:
  [`0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389`](https://snowtrace.io/address/0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389#code);
- initial Core L1 nominal: `100 XNTD`;
- initial Core L1 burn: `100,000,000 aXEN`;
- protocol halving interval: `5,184,000 seconds` (`60 days`);
- aXEN burn halving interval: `10,368,000 seconds` (`120 days`);
- Stake duration range: `10–240 days`;
- fresh Avalanche genesis; no bridge mint authority was added.

## Contract addresses

| Contract | Address | Deployment block | Deployment transaction |
| --- | --- | ---: | --- |
| Core | [`0x9F6f1F6883F00DB5e593Cfc02dd04A7319dA9922`](https://snowtrace.io/address/0x9F6f1F6883F00DB5e593Cfc02dd04A7319dA9922#code) | 92752373 | [`0x3a3ee8…5498c`](https://snowtrace.io/tx/0x3a3ee85139d512225432a55ff749937b8e13f29bf8ca996dbb4efeb1b995498c) |
| XNTD | [`0x7F45490C069B166518A18EF663DB21cfdb2BA04D`](https://snowtrace.io/address/0x7F45490C069B166518A18EF663DB21cfdb2BA04D#code) | 92752378 | [`0x872435…960d9`](https://snowtrace.io/tx/0x872435868b7a35b494ef1ce4a61b8337c0740d79e1bb01cc72681d57b62960d9) |
| Stake | [`0x3b9061ca65dc596d68851b0C457dA823959C1882`](https://snowtrace.io/address/0x3b9061ca65dc596d68851b0C457dA823959C1882#code) | 92752639 | [`0x80a033…43d84`](https://snowtrace.io/tx/0x80a0334c4e4af6a5f7e71c6bcce37b456fa137b35c7ccf41abd1b51948043d84) |
| Forge | [`0x23678b27557CA31fea54453b9ce481916cd99F87`](https://snowtrace.io/address/0x23678b27557CA31fea54453b9ce481916cd99F87#code) | 92752648 | [`0xcacbbb…2ad2c`](https://snowtrace.io/tx/0xcacbbb92bdd0d56cb69618d931830a00b725cd482550ef7c895452c5a4d2ad2c) |
| Market | [`0xD2F3fc7FC217391a1CB96dDbC9F2d4fb518a80Ac`](https://snowtrace.io/address/0xD2F3fc7FC217391a1CB96dDbC9F2d4fb518a80Ac#code) | 92752662 | [`0x7b4822…389b3`](https://snowtrace.io/tx/0x7b482280548a3953fa3edb80718f0423e4cf0433ff345df66f9e7282585389b3) |
| NFT Lens | [`0x94f9efB4561A01443D85042826140388F773ef4A`](https://snowtrace.io/address/0x94f9efB4561A01443D85042826140388F773ef4A#code) | 92752670 | [`0x7a36c8…bb8f2`](https://snowtrace.io/tx/0x7a36c8cc9e1cd7dd728e8fefceff4d47d035a39b45587adeaa756685f8bbb8f2) |
| Core tokenURI Lens | [`0x7E310135DC51aA0caaAa596b73C96134b797C752`](https://snowtrace.io/address/0x7E310135DC51aA0caaAa596b73C96134b797C752#code) | 92752673 | [`0x7cfbaf…09c13`](https://snowtrace.io/tx/0x7cfbafccd9682ea1b8e5c1fd42d74fdfc56fa28c08e0778ee2b2d6511eb09c13) |
| Stake tokenURI Lens | [`0xcA03ACa93390d83D561E0612f38FfAEc5219BBD8`](https://snowtrace.io/address/0xcA03ACa93390d83D561E0612f38FfAEc5219BBD8#code) | 92752678 | [`0x57bd8a…5fcac`](https://snowtrace.io/tx/0x57bd8aef4ef811f0fceb9138997bb1c9f915c7c6fbd14f516b60a062fb55fcac) |

## Final wiring transactions

| Action | Block | Transaction |
| --- | ---: | --- |
| Core tokenURI Lens set | 92752698 | [`0xc5df15…f2c04`](https://snowtrace.io/tx/0xc5df1519f6e249de276aa883904d09bbcd7c104fd1957bb69f7bc35467ef2c04) |
| Stake tokenURI Lens set and Stake deployer rights burned | 92752701 | [`0x23d441…08a0`](https://snowtrace.io/tx/0x23d441ff9aaaa0bbf7ab3b306e33384422cdd2166d04c2ea60758667da4d08a0) |
| Core initialized, XNTD bound to Forge and Core deployer rights burned | 92752707 | [`0xacf44e…9108`](https://snowtrace.io/tx/0xacf44ee7cc5a70e1b7aca9dcbad953299a42c4f3ae5d2d7911dc9f45bf169108) |

## Post-deployment verification

The immediate read-only checker passed after deployment and confirmed:

- code at the official aXEN dependency and all eight XC addresses;
- complete Core, Stake, XNTD, Forge, Market and Lens wiring;
- `Core.initialized == true`;
- `Core.DEPLOYER == 0x0000000000000000000000000000000000000000`;
- `Stake.DEPLOYER == 0x0000000000000000000000000000000000000000`;
- `XNTD.forgeBound == true`;
- fresh Market state: `activeListingCount == 0`, `nextListingId == 1`;
- immutable genesis parameters and Stake range;
- current epoch `0`, base nominal `100 XNTD`, burn `100,000,000 aXEN`
  and base APR `1000 bps`.

The Hardhat source-verification sequence completed with exit code `0`. All eight
contract sources are available through the Snowtrace links above.

## Review and assurance boundary

Before deployment:

- local suite: `124 passing`;
- real-aXEN Avalanche fork suite: `2 passing`;
- partial-deployment recovery test: `1 passing`;
- deployment gas profile: `18,478,023 gas`;
- live read-only preflight: passed;
- Theo's independent technical review returned final `GO`.

This work was independently technically reviewed, but it was not a professional
third-party audit or formal verification. Deployment proceeded with that
limitation explicitly acknowledged.
