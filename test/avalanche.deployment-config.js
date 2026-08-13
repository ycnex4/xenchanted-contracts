const { expect } = require("chai");

const config = require("../scripts/lib/avalanche-mainnet");

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
});
