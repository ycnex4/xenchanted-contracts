const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedNFT - wallet mint limit", function () {

  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    // 6) Deploy URI lens contracts and wire them before Core init
    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    // 7) init Core
    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, xen, core };
  }

  it("allows mint up to MAX_WALLET_NFTS", async function () {
    const { alice, xen, core } = await deploy();

    const MAX = await core.MAX_WALLET_NFTS();

    await xen.faucet(alice.address, ethers.parseEther("100000"));

    for (let i = 0; i < MAX; i++) {
      await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
      await core.connect(alice).mintWithXEN();
    }

    expect(await core.balanceOf(alice.address)).to.equal(MAX);
  });

  it("reverts mint when wallet already holds MAX_WALLET_NFTS", async function () {
    const { alice, xen, core } = await deploy();

    const MAX = await core.MAX_WALLET_NFTS();

    await xen.faucet(alice.address, ethers.parseEther("100000"));

    for (let i = 0; i < MAX; i++) {
      await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
      await core.connect(alice).mintWithXEN();
    }

    await expect(
      (async () => {
        await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
        return core.connect(alice).mintWithXEN();
      })()
    ).to.be.revertedWith("MAX_WALLET");
  });

});
