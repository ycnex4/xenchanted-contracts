const { expect } = require("chai");

const config = require("../scripts/lib/avalanche-mainnet");
const {
  AVALANCHE_ADDRESS_ENV_BY_NAME,
  readAvalancheAddresses,
} = require("../scripts/lib/avalanche-addresses");
const {
  requireReviewedSourceCommit,
} = require("../scripts/lib/avalanche-deployment-safety");

describe("Avalanche deployment constants", function () {
  it("pins Avalanche C-Chain mainnet and the official aXEN address", function () {
    expect(config.AVALANCHE_MAINNET_CHAIN_ID).to.equal(43114n);
    expect(config.AXEN_MAINNET).to.equal(
      "0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389"
    );
  });

  it("pins the real Avalanche XEN metadata", function () {
    expect(config.AXEN_EXPECTED_NAME).to.equal("XEN Crypto");
    expect(config.AXEN_EXPECTED_SYMBOL).to.equal("aXEN");
    expect(config.AXEN_EXPECTED_DECIMALS).to.equal(18);
  });

  it("keeps the reviewed production genesis values", function () {
    expect(config.INITIAL_NOMINAL_TEXT).to.equal("100");
    expect(config.INITIAL_XEN_BURN_TEXT).to.equal("100000000");
    expect(config.AVALANCHE_PROTOCOL_PROFILE).to.deep.include({
      halvingIntervalSeconds: 60 * 24 * 60 * 60,
      xenBurnHalvingIntervalSeconds: 120 * 24 * 60 * 60,
      minStakeDays: 10,
      maxStakeDays: 240,
    });
  });

  it("uses Avalanche-specific deploy and rights-burn confirmations", function () {
    expect(config.DEPLOY_CONFIRMATION).to.include("AVALANCHE_MAINNET");
    expect(config.GENESIS_CONFIRMATION).to.include("FRESH_AVALANCHE_GENESIS");
    expect(config.GENESIS_CONFIRMATION).to.include("60D_120D_10D_240D");
    expect(config.INIT_CONFIRMATION).to.include("BURN_DEPLOYER_RIGHTS");
  });

  it("isolates Avalanche deployment addresses from other networks", function () {
    const env = Object.fromEntries(
      Object.values(AVALANCHE_ADDRESS_ENV_BY_NAME).map((name, index) => [
        name,
        `address-${index}`,
      ])
    );

    const addresses = readAvalancheAddresses(env);
    expect(addresses.Core).to.equal("address-0");
    expect(addresses.StakeTokenURILens).to.equal("address-7");
    expect(Object.values(AVALANCHE_ADDRESS_ENV_BY_NAME)).to.satisfy((names) =>
      names.every((name) => name.startsWith("AVALANCHE_"))
    );
  });

  it("requires the reviewed full source commit to match HEAD", function () {
    const reviewed = "a".repeat(40);
    expect(() => requireReviewedSourceCommit(reviewed, reviewed)).to.not.throw();
    expect(() => requireReviewedSourceCommit(reviewed, "a".repeat(39))).to.throw(
      "full 40-character"
    );
    expect(() =>
      requireReviewedSourceCommit(reviewed, "b".repeat(40))
    ).to.throw("unreviewed source");
  });
});
