// test/stake.reverts.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("xEnchantedStake - negative tests", function () {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");
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

    return { deployer, alice, bob, xen, core, xntd, stake, forge };
  }

  async function mintOrdinaryL1ToAlice(env) {
    const { alice, xen, core } = env;
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id=1 in fresh fixture
    return 1;
  }

  async function mintOrdinaryL2ToAlice(env) {
    const { alice, xen, core } = env;
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id=1
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id=2
    await core.connect(alice).enchant(1, 2); // id=3
    return 3;
  }

  it("stake() reverts with DUR_MIN if durationDays < 30", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryL1ToAlice(env);

    await expect(stake.connect(alice).stake(1, 29)).to.be.revertedWith("DUR_MIN");
  });

  it("stake() reverts with DUR_MAX if durationDays > 730", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryL1ToAlice(env);

    await expect(stake.connect(alice).stake(1, 731)).to.be.revertedWith("DUR_MAX");
  });

  it("stake() reverts with L1_STAKE for Core L1", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    await mintOrdinaryL1ToAlice(env);

    await expect(stake.connect(alice).stake(1, 30)).to.be.revertedWith("L1_STAKE");
  });

  it("previewStake() validates the intended staker owner", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);

    const ok = await stake.previewStake(tokenId, 30, alice.address);
    expect(ok[0]).to.equal(true);
    expect(ok[1]).to.equal("");

    const wrongOwner = await stake.previewStake(tokenId, 30, bob.address);
    expect(wrongOwner[0]).to.equal(false);
    expect(wrongOwner[1]).to.equal("OWN");
  });

  it("previewStake() rejects zero intended staker", async function () {
    const env = await deploy();
    const { stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);
    const preview = await stake.previewStake(tokenId, 30, ethers.ZeroAddress);
    expect(preview[0]).to.equal(false);
    expect(preview[1]).to.equal("USR0");
  });

  it("stake() reverts if caller is not owner of Core NFT", async function () {
    const env = await deploy();
    const { bob, stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);

    await expect(stake.connect(bob).stake(tokenId, 30)).to.be.revertedWith("OS");
  });

  it("stake() reverts with EX on second stake attempt of same id (position NFT already exists)", async function () {
    const env = await deploy();
    const { alice, stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);

    await stake.connect(alice).stake(tokenId, 30);

    await expect(stake.connect(alice).stake(tokenId, 30)).to.be.revertedWith("EX");
  });

  it("redeem() reverts with OWN if caller is not owner of pNFT", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);
    await stake.connect(alice).stake(tokenId, 30);

    await expect(stake.connect(bob).redeem(tokenId)).to.be.revertedWith("OWN");
  });

  it("redeem() reverts if pNFT was transferred away and old owner tries to redeem", async function () {
    const env = await deploy();
    const { alice, bob, stake } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);
    await stake.connect(alice).stake(tokenId, 30);

    await stake.connect(alice).transferFrom(alice.address, bob.address, tokenId);

    await expect(stake.connect(alice).redeem(tokenId)).to.be.revertedWith("OWN");
  });

  it("redeem() works only for current pNFT owner after transfer", async function () {
    const env = await deploy();
    const { alice, bob, stake, core } = env;

    const tokenId = await mintOrdinaryL2ToAlice(env);
    await stake.connect(alice).stake(tokenId, 30);

    await stake.connect(alice).transferFrom(alice.address, bob.address, tokenId);

    await stake.connect(bob).redeem(tokenId);

    expect(await core.ownerOf(tokenId)).to.equal(bob.address);
  });
});
