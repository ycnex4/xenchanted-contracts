const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("Production genesis constants", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("100000000");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn, P.halvingIntervalSeconds, P.xenBurnHalvingIntervalSeconds);

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress(), P.minStakeDays, P.maxStakeDays);

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
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

  it("uses immutable production genesis config", async function () {
    const { core, initialNominal, initialXenBurn } = await deploy();

    expect(await core.INITIAL_NOMINAL()).to.equal(initialNominal);
    expect(await core.INITIAL_XEN_BURN()).to.equal(initialXenBurn);

    expect(initialNominal).to.equal(ethers.parseEther("100"));
    expect(initialXenBurn).to.equal(ethers.parseEther("100000000"));

    // 100,000,000 XEN burned for 100 XNTD nominal
    // => 1 XNTD nominal : 1,000,000 XEN burned
    expect(initialXenBurn / initialNominal).to.equal(1_000_000n);
  });

  it("mintWithXEN burns 100,000,000 XEN and mints Core L1 with 100 XNTD nominal", async function () {
    const { alice, xen, core, initialNominal, initialXenBurn } = await deploy();

    await xen.faucet(alice.address, initialXenBurn);

    const xenBefore = await xen.balanceOf(alice.address);
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN();
    const xenAfter = await xen.balanceOf(alice.address);

    expect(xenBefore - xenAfter).to.equal(initialXenBurn);

    expect(await core.ownerOf(1)).to.equal(alice.address);

    const data = await core.nftData(1);
    expect(data.level).to.equal(1);
    expect(data.isForged).to.equal(false);
    expect(data.nominal).to.equal(initialNominal);
    expect(data.xenBurned).to.equal(initialXenBurn);
    expect(data.xntdBurned).to.equal(0n);
  });
});
