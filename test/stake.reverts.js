// test/stake.reverts.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedStake - negative tests", function () {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

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

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, bob, xen, core, xntd, stake, forge };
  }

  async function mintOrdinaryToAlice(env) {
    const { alice, xen, core } = env;
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1 in fresh fixture
  }

  it("stake() reverts with DUR_MIN if durationDays < 30", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryToAlice(env);

    await expect(stake.connect(alice).stake(1, 29)).to.be.revertedWith("DUR_MIN");
  });

  it("stake() reverts with DUR_MAX if durationDays > 730", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryToAlice(env);

    await expect(stake.connect(alice).stake(1, 731)).to.be.revertedWith("DUR_MAX");
  });

  it("stake() reverts if caller is not owner of Core NFT", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    await mintOrdinaryToAlice(env);

    await expect(stake.connect(bob).stake(1, 30)).to.be.revertedWith("OS");
  });

  it("stake() reverts with EX on second stake attempt of same id (position NFT already exists)", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryToAlice(env);

    await stake.connect(alice).stake(1, 30);

    await expect(stake.connect(alice).stake(1, 30)).to.be.revertedWith("EX");
  });

  it("redeem() reverts with OWN if caller is not owner of pNFT", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    await mintOrdinaryToAlice(env);
    await stake.connect(alice).stake(1, 30);

    await expect(stake.connect(bob).redeem(1)).to.be.revertedWith("OWN");
  });

  it("redeem() reverts if pNFT was transferred away and old owner tries to redeem", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    await mintOrdinaryToAlice(env);
    await stake.connect(alice).stake(1, 30);

    await stake.connect(alice).transferFrom(alice.address, bob.address, 1);

    await expect(stake.connect(alice).redeem(1)).to.be.revertedWith("OWN");
  });

  it("redeem() works only for current pNFT owner after transfer", async function () {
    const env = await deploy();
    const { alice, bob, stake, core } = env;

    await mintOrdinaryToAlice(env);
    await stake.connect(alice).stake(1, 30);

    await stake.connect(alice).transferFrom(alice.address, bob.address, 1);

    await stake.connect(bob).redeem(1);

    expect(await core.ownerOf(1)).to.equal(bob.address);
  });
});