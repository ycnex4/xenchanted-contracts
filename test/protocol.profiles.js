const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const {
  ETHEREUM_PROTOCOL_PROFILE,
  AVALANCHE_PROTOCOL_PROFILE,
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("../scripts/lib/protocol-profiles");

async function setNextBlockTimestamp(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await network.provider.send("evm_mine");
}

async function deployCore(profile) {
  const MockXEN = await ethers.getContractFactory("MockXEN");
  const xen = await MockXEN.deploy();

  const initialNominal = ethers.parseEther("100");
  const initialXenBurn = ethers.parseEther("100000000");
  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const core = await Core.deploy(
    ...coreConstructorArgs(
      await xen.getAddress(),
      initialNominal,
      initialXenBurn,
      profile
    )
  );

  return { xen, core, initialNominal, initialXenBurn };
}

async function deployProtocol(profile) {
  const [deployer, alice] = await ethers.getSigners();
  const { xen, core, initialNominal, initialXenBurn } = await deployCore(profile);

  const XNTD = await ethers.getContractFactory("XNTDToken");
  const xntd = await XNTD.deploy(await core.getAddress());

  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const stake = await Stake.deploy(
    ...stakeConstructorArgs(await core.getAddress(), profile)
  );

  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

  const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
  const tokenUriLens = await TokenURILens.deploy(await core.getAddress());

  const StakeTokenURILens = await ethers.getContractFactory(
    "xEnchantedStakeTokenURILens"
  );
  const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());

  await core.setTokenURILens(await tokenUriLens.getAddress());
  await stake.setTokenURILens(await stakeTokenUriLens.getAddress());
  await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

  return {
    deployer,
    alice,
    xen,
    core,
    xntd,
    stake,
    forge,
    initialNominal,
    initialXenBurn,
  };
}

async function mintOrdinaryL2(env) {
  const { alice, xen, core, initialXenBurn } = env;
  await xen.faucet(alice.address, initialXenBurn * 2n);

  for (let i = 0; i < 2; i++) {
    await xen.connect(alice).approve(await core.getAddress(), initialXenBurn);
    await core.connect(alice).mintWithXEN();
  }

  await core.connect(alice).enchant(1, 2);
  return 3;
}

describe("Immutable protocol profiles", function () {
  for (const profile of [ETHEREUM_PROTOCOL_PROFILE, AVALANCHE_PROTOCOL_PROFILE]) {
    it(`${profile.name} exposes and follows its immutable economic clock`, async function () {
      const { core, initialNominal, initialXenBurn } = await deployCore(profile);
      const Stake = await ethers.getContractFactory("xEnchantedStake");
      const stake = await Stake.deploy(
        ...stakeConstructorArgs(await core.getAddress(), profile)
      );

      expect(await core.HALVING_INTERVAL()).to.equal(
        BigInt(profile.halvingIntervalSeconds)
      );
      expect(await core.XEN_BURN_HALVING_INTERVAL()).to.equal(
        BigInt(profile.xenBurnHalvingIntervalSeconds)
      );
      expect(await stake.MIN_DAYS()).to.equal(BigInt(profile.minStakeDays));
      expect(await stake.MAX_DAYS()).to.equal(BigInt(profile.maxStakeDays));
      expect(await core.baseAprBpsNow()).to.equal(1000n);

      const genesisTs = await core.GENESIS_TS();
      await setNextBlockTimestamp(
        genesisTs + BigInt(profile.halvingIntervalSeconds)
      );

      expect(await core.currentEpoch()).to.equal(1n);
      expect(await core.currentBaseNominal()).to.equal(initialNominal / 2n);
      expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn);
      expect(await core.baseAprBpsNow()).to.equal(900n);

      await setNextBlockTimestamp(
        genesisTs + BigInt(profile.xenBurnHalvingIntervalSeconds)
      );

      expect(await core.currentEpoch()).to.equal(2n);
      expect(await core.currentBaseNominal()).to.equal(initialNominal / 4n);
      expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn / 2n);
      expect(await core.baseAprBpsNow()).to.equal(800n);

      await setNextBlockTimestamp(
        genesisTs + 8n * BigInt(profile.halvingIntervalSeconds)
      );
      expect(await core.currentEpoch()).to.equal(8n);
      expect(await core.currentBaseNominal()).to.equal(initialNominal / 256n);
      expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn / 16n);
      expect(await core.baseAprBpsNow()).to.equal(200n);

      await setNextBlockTimestamp(
        genesisTs + 9n * BigInt(profile.halvingIntervalSeconds)
      );
      expect(await core.baseAprBpsNow()).to.equal(200n);
    });
  }

  it("rejects zero or inverted immutable time parameters", async function () {
    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();
    const Core = await ethers.getContractFactory("xEnchantedNFT");

    await expect(
      Core.deploy(await xen.getAddress(), 1, 1, 0, 1)
    ).to.be.revertedWith("HALV");
    await expect(
      Core.deploy(await xen.getAddress(), 1, 1, 1, 0)
    ).to.be.revertedWith("XHALV");
    await expect(
      Core.deploy(await xen.getAddress(), 1, 1, 2, 1)
    ).to.be.revertedWith("XHALV_RANGE");

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    await expect(Stake.deploy(await xen.getAddress(), 0, 1)).to.be.revertedWith(
      "MIN0"
    );
    await expect(Stake.deploy(await xen.getAddress(), 11, 10)).to.be.revertedWith(
      "DUR_RANGE"
    );
    await expect(
      Stake.deploy(await xen.getAddress(), 1, 49711)
    ).to.be.revertedWith("DUR32");
  });

  it("Avalanche accepts 10-240 stake days and rejects values outside the profile", async function () {
    const env = await deployProtocol(AVALANCHE_PROTOCOL_PROFILE);
    const { alice, stake } = env;
    const tokenId = await mintOrdinaryL2(env);

    const below = await stake.previewStake(tokenId, 9, alice.address);
    expect(below.ok).to.equal(false);
    expect(below.reason).to.equal("DUR_MIN");

    const minimum = await stake.previewStake(tokenId, 10, alice.address);
    expect(minimum.ok).to.equal(true);

    const maximum = await stake.previewStake(tokenId, 240, alice.address);
    expect(maximum.ok).to.equal(true);

    const above = await stake.previewStake(tokenId, 241, alice.address);
    expect(above.ok).to.equal(false);
    expect(above.reason).to.equal("DUR_MAX");

    await stake.connect(alice).stake(tokenId, 240);
    const view = await stake.getStakeView(tokenId);
    expect(view.durationDays).to.equal(240n);
  });

  it("Avalanche Forge bounds follow the 60-day base nominal epoch", async function () {
    const { core, forge, initialNominal } = await deployProtocol(
      AVALANCHE_PROTOCOL_PROFILE
    );

    expect(await forge.minForgeAmount()).to.equal(initialNominal * 5n);
    expect(await forge.maxForgeAmount()).to.equal(initialNominal * 1000n);

    const genesisTs = await core.GENESIS_TS();
    await setNextBlockTimestamp(
      genesisTs + BigInt(AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds)
    );

    expect(await core.currentBaseNominal()).to.equal(initialNominal / 2n);
    expect(await forge.minForgeAmount()).to.equal((initialNominal / 2n) * 5n);
    expect(await forge.maxForgeAmount()).to.equal((initialNominal / 2n) * 1000n);
  });
});
