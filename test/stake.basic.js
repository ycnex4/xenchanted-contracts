// test/stake.basic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("xEnchantedStake - basic tests", function () {

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
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, bob, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  async function mintL1(env, who = env.alice) {
    const { xen, core } = env;
    await xen.faucet(who.address, ethers.parseEther("1000"));
    await xen.connect(who).approve(await core.getAddress(), await core.currentXenBurnAmount());
    const tx = await core.connect(who).mintWithXEN();
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Minted");
    return log.args.id;
  }

  async function enchant(env, id1, id2, who = env.alice) {
    const tx = await env.core.connect(who).enchant(id1, id2);
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");
    return log.args.id;
  }

  async function fundXntd(env, targetAmount) {
    const { alice, xntd, core } = env;
    while ((await xntd.balanceOf(alice.address)) < targetAmount) {
      const id = await mintL1(env, alice);
      await core.connect(alice).redeem(id);
    }
  }

  async function forgeOne(env, amount) {
    const { alice, xntd, forge } = env;
    const xntdAmount = amount ?? (await forge.minForgeAmount());
    await fundXntd(env, xntdAmount);
    const baseId = await mintL1(env, alice);
    await xntd.connect(alice).approve(await forge.getAddress(), xntdAmount);
    const forgedId = await forge.connect(alice).forge.staticCall(baseId, xntdAmount);
    await forge.connect(alice).forge(baseId, xntdAmount);
    return forgedId;
  }


  function ceilMulDiv(n, a, b) {
    return (n * a + (b - 1n)) / b;
  }

  async function makeCoreL2(env) {
    const id1 = await mintL1(env, env.alice);
    const id2 = await mintL1(env, env.alice);
    return enchant(env, id1, id2, env.alice);
  }

  it("stake(): burns Core L2 NFT -> mints pNFT (same id), pos active", async function () {
    const env = await deploy();
    const { alice, core, stake } = env;

    const l2Id = await makeCoreL2(env);

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    await expect(core.ownerOf(l2Id)).to.be.reverted;
    expect(await stake.ownerOf(l2Id)).to.equal(alice.address);

    const p = await stake.pos(l2Id);
    const snap = p[0];
    const startTs = p[1];
    const endTs = p[2];
    const baseAprBps = p[3];
    const active = p[4];

    expect(active).to.equal(true);
    expect(endTs).to.be.greaterThan(startTs);

    expect(snap.level).to.equal(2);
    expect(snap.isForged).to.equal(false);
    expect(snap.nominal).to.not.equal(0n);

    expect(baseAprBps).to.be.greaterThanOrEqual(200);
    expect(baseAprBps).to.be.lessThanOrEqual(1000);

    const view = await stake.getStakeView(l2Id);
    expect(view.tokenId).to.equal(l2Id);
    expect(view.durationDays).to.equal(30);
    expect(view.levelBonusBps).to.equal(100);
    expect(view.forgedBonusBps).to.equal(0);
    expect(view.totalAprBps).to.equal(view.baseAprBps + view.levelBonusBps);
    expect(view.expectedReward).to.be.gt(0n);
    expect(view.availableReward).to.equal(0n);
  });

  it("redeem() after maturity: phoenix-mints Core NFT back + mints XNTD reward", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const l2Id = await makeCoreL2(env);
    const d0 = await core.nftData(l2Id);
    const nominal0 = d0.nominal;

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    const pos = await stake.pos(l2Id);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    const prev = await stake.previewRedeem(l2Id);
    expect(prev[0]).to.equal(true);
    expect(prev[1]).to.equal(true);
    const rewardExpected = prev[7];

    const xBefore = await xntd.balanceOf(alice.address);

    await stake.connect(alice).redeem(l2Id);

    await expect(stake.ownerOf(l2Id)).to.be.reverted;
    expect(await core.ownerOf(l2Id)).to.equal(alice.address);

    const d1 = await core.nftData(l2Id);
    expect(d1.nominal).to.equal(nominal0);

    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(rewardExpected);
  });

  it("redeem() early: phoenix-mints Core NFT back with 1% penalty (ceil), reward=0", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const l2Id = await makeCoreL2(env);
    const d0 = await core.nftData(l2Id);
    const nominal0 = d0.nominal;

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    const xBefore = await xntd.balanceOf(alice.address);

    const prev = await stake.previewRedeem(l2Id);
    expect(prev[0]).to.equal(true);
    expect(prev[1]).to.equal(false);
    expect(prev[6]).to.be.gt(0n);
    expect(prev[7]).to.equal(0n);

    await stake.connect(alice).redeem(l2Id);

    expect(await core.ownerOf(l2Id)).to.equal(alice.address);

    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(0n);

    const expectedNomAfter = ceilMulDiv(nominal0, 9900n, 10_000n);
    const d1 = await core.nftData(l2Id);
    expect(d1.nominal).to.equal(expectedNomAfter);
  });

  it("forged L2 maturity reward includes +500 bps bonus", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const forgedA = await forgeOne(env);
    const forgedB = await forgeOne(env);
    const forgedL2 = await enchant(env, forgedA, forgedB, alice);

    const d = await core.nftData(forgedL2);
    expect(d.isForged).to.equal(true);
    expect(d.level).to.equal(2);

    await core.connect(alice).approve(await stake.getAddress(), forgedL2);
    await stake.connect(alice).stake(forgedL2, 30);

    const view = await stake.getStakeView(forgedL2);
    expect(view.levelBonusBps).to.equal(100);
    expect(view.forgedBonusBps).to.equal(500);
    expect(view.totalAprBps).to.equal(view.baseAprBps + 600n);
    expect(view.expectedReward).to.be.gt(0n);
    expect(view.availableReward).to.equal(0n);

    const pos = await stake.pos(forgedL2);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    const prev = await stake.previewRedeem(forgedL2);
    expect(prev[1]).to.equal(true);
    const rewardExpected = prev[7];

    const xBefore = await xntd.balanceOf(alice.address);
    await stake.connect(alice).redeem(forgedL2);
    const xAfter = await xntd.balanceOf(alice.address);

    expect(xAfter - xBefore).to.equal(rewardExpected);
  });
});
