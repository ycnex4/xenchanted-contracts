const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Lens source-of-truth views", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("100000000");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(
      await xen.getAddress(),
      initialNominal,
      initialXenBurn
    );

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
    const nftLens = await NFTLens.deploy(await core.getAddress(), await stake.getAddress());

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
      nftLens,
      tokenUriLens,
      stakeTokenUriLens,
      initialNominal,
      initialXenBurn,
    };
  }

  async function mintCoreL2(env) {
    const { alice, xen, core } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000000000"));

    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id 1
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id 2
    await core.connect(alice).enchant(1, 2); // id 3

    return 3;
  }

  it("NFTLens.getProtocolParams reads epoch and halving values from Core", async function () {
    const { core, nftLens, initialNominal, initialXenBurn } = await deploy();

    const p = await nftLens.getProtocolParams();

    expect(p.genesisTs).to.equal(await core.GENESIS_TS());
    expect(p.halvingInterval).to.equal(await core.HALVING_INTERVAL());
    expect(p.currentEpoch).to.equal(await core.currentEpoch());
    expect(p.nextHalvingTs).to.equal(await core.nextHalvingTs());

    expect(p.initialNominal).to.equal(initialNominal);
    expect(p.currentBaseNominal).to.equal(await core.currentBaseNominal());

    expect(p.initialXenBurn).to.equal(initialXenBurn);
    expect(p.currentXenBurnAmount).to.equal(await core.currentXenBurnAmount());

    expect(p.enchantMultiplier).to.equal(await core.ENCHANT_MULTIPLIER());
    expect(p.maxLevel).to.equal(await core.MAX_LEVEL());
    expect(p.baseAprBpsNow).to.equal(await core.baseAprBpsNow());
    expect(p.bpsDenom).to.equal(await core.BPS_DENOM());
    expect(p.earlyPenaltyBps).to.equal(await core.EARLY_PENALTY_BPS());
    expect(p.maxWalletNfts).to.equal(await core.MAX_WALLET_NFTS());
  });

  it("NFTLens.previewStakeAPRBreakdown matches Stake source-of-truth APR breakdown", async function () {
    const env = await deploy();
    const { stake, nftLens } = env;

    const tokenId = await mintCoreL2(env);

    const fromStake = await stake.previewStakeAPRBreakdown(tokenId);
    const fromLens = await nftLens.previewStakeAPRBreakdown(tokenId);

    expect(fromLens.exists).to.equal(fromStake.exists_);
    expect(fromLens.stakeable).to.equal(fromStake.stakeable);
    expect(fromLens.baseAprBps).to.equal(fromStake.baseAprBps);
    expect(fromLens.levelBonusBps).to.equal(fromStake.levelBonusBps);
    expect(fromLens.forgedBonusBps).to.equal(fromStake.forgedBonusBps);
    expect(fromLens.totalAprBps).to.equal(fromStake.totalAprBps);
  });

  it("xEnchantedNFTLens rejects zero and non-contract source addresses", async function () {
    const { alice, core, stake } = await deploy();

    const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");

    await expect(
      NFTLens.deploy(ethers.ZeroAddress, await stake.getAddress())
    ).to.be.revertedWith("C0");

    await expect(
      NFTLens.deploy(await core.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWith("S0");

    await expect(
      NFTLens.deploy(alice.address, await stake.getAddress())
    ).to.be.revertedWith("C_CODE");

    await expect(
      NFTLens.deploy(await core.getAddress(), alice.address)
    ).to.be.revertedWith("S_CODE");
  });

  it("xEnchantedTokenURILens rejects zero and non-contract Core source", async function () {
    const { alice } = await deploy();

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");

    await expect(
      TokenURILens.deploy(ethers.ZeroAddress)
    ).to.be.revertedWith("C0");

    await expect(
      TokenURILens.deploy(alice.address)
    ).to.be.revertedWith("C_CODE");
  });

  it("xEnchantedStakeTokenURILens rejects zero and non-contract Stake source", async function () {
    const { alice } = await deploy();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");

    await expect(
      StakeTokenURILens.deploy(ethers.ZeroAddress)
    ).to.be.revertedWith("S0");

    await expect(
      StakeTokenURILens.deploy(alice.address)
    ).to.be.revertedWith("S_CODE");
  });
});
