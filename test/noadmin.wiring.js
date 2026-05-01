const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("No-admin / init / wiring invariants", function () {
  async function deployBase() {
    const [deployer, alice] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("100000000");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

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

  async function deployWired() {
    const env = await deployBase();
    const { core, stake, xntd, forge } = env;

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return {
      ...env,
      tokenUriLens,
      stakeTokenUriLens,
    };
  }

  it("Core.init reverts without Core tokenURI lens and does not bind Forge", async function () {
    const { core, xntd, stake, forge } = await deployBase();

    await expect(
      core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress())
    ).to.be.revertedWith("URI");

    expect(await xntd.FORGE()).to.equal(ethers.ZeroAddress);
    expect(await xntd.forgeBound()).to.equal(false);
    expect(await core.initialized()).to.equal(false);
  });

  it("Core.init is one-time and burns Core deployer rights", async function () {
    const { deployer, core, xntd, stake, forge } = await deployWired();

    expect(await core.initialized()).to.equal(true);
    expect(await core.DEPLOYER()).to.equal(ethers.ZeroAddress);

    await expect(
      core.connect(deployer).init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress())
    ).to.be.revertedWith("DEP");
  });

  it("Core tokenURI lens cannot be changed after init", async function () {
    const { deployer, core } = await deployWired();

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const newLens = await TokenURILens.deploy(await core.getAddress());

    await expect(
      core.connect(deployer).setTokenURILens(await newLens.getAddress())
    ).to.be.revertedWith("DEP");
  });

  it("Stake tokenURI lens cannot be changed after it is set", async function () {
    const { deployer, stake } = await deployWired();

    expect(await stake.DEPLOYER()).to.equal(ethers.ZeroAddress);

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const newStakeLens = await StakeTokenURILens.deploy(await stake.getAddress());

    await expect(
      stake.connect(deployer).setTokenURILens(await newStakeLens.getAddress())
    ).to.be.revertedWith("DEP");
  });

  it("XNTD Forge binding is one-time and cannot be called by deployer", async function () {
    const { deployer, core, xntd, forge } = await deployWired();

    expect(await xntd.FORGE()).to.equal(await forge.getAddress());
    expect(await xntd.forgeBound()).to.equal(true);

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const anotherForge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    await expect(
      xntd.connect(deployer).bindForge(await anotherForge.getAddress())
    ).to.be.revertedWith("CORE");
  });

  it("XNTD Forge binding cannot be repeated even by Core address", async function () {
    const { core, xntd, forge } = await deployWired();

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const anotherForge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    const coreAddr = await core.getAddress();

    await ethers.provider.send("hardhat_setBalance", [
      coreAddr,
      "0x1000000000000000000",
    ]);

    await ethers.provider.send("hardhat_impersonateAccount", [coreAddr]);
    const coreSigner = await ethers.getSigner(coreAddr);

    await expect(
      xntd.connect(coreSigner).bindForge(await anotherForge.getAddress())
    ).to.be.revertedWith("BOUND");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [coreAddr]);
  });

  it("deployer cannot mint XNTD or use Forge-only burn path", async function () {
    const { deployer, alice, xntd } = await deployWired();

    await expect(
      xntd.connect(deployer).mint(alice.address, ethers.parseEther("1"))
    ).to.be.revertedWith("CORE");

    await expect(
      xntd.connect(deployer).burnForForge(alice.address, ethers.parseEther("1"))
    ).to.be.revertedWith("FORGE");
  });

  it("protocol wiring points to the intended immutable contracts", async function () {
    const { core, xntd, stake, forge } = await deployWired();

    expect(await xntd.CORE()).to.equal(await core.getAddress());
    expect(await xntd.FORGE()).to.equal(await forge.getAddress());

    expect(await stake.CORE()).to.equal(await core.getAddress());

    expect(await forge.CORE()).to.equal(await core.getAddress());
    expect(await forge.XNTD()).to.equal(await xntd.getAddress());

    expect(await core.STAKING()).to.equal(await stake.getAddress());
    expect(await core.FORGE()).to.equal(await forge.getAddress());
  });
});