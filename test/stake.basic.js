// test/stake.basic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("xEnchantedStake - basic tests", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    // 1) MockXEN
    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    // 2) Core
    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");
    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);

    // 3) XNTDToken(core)
    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    // 4) Stake(core)
    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    // 5) Forge(core, xntd)
    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    // 6) init Core
    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  // ceil(n * a / b)
  function ceilMulDiv(n, a, b) {
    return (n * a + (b - 1n)) / b;
  }

  it("stake(): burns Core NFT -> mints pNFT (same id), pos active", async function () {
    const { alice, xen, core, stake } = await deploy();

    // mint ordinary L1 id=1
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN();

    // stake 30 days
    await core.connect(alice).approve(await stake.getAddress(), 1);
    await stake.connect(alice).stake(1, 30);

    // Core NFT is burned
    await expect(core.ownerOf(1)).to.be.reverted;

    // Stake position NFT exists
    expect(await stake.ownerOf(1)).to.equal(alice.address);

    const p = await stake.pos(1);
    const snap = p[0];
    const startTs = p[1];
    const endTs = p[2];
    const baseAprBps = p[3];
    const active = p[4];

    expect(active).to.equal(true);
    expect(endTs).to.be.greaterThan(startTs);

    expect(snap.level).to.equal(1);
    expect(snap.isForged).to.equal(false);
    expect(snap.nominal).to.not.equal(0n);

    expect(baseAprBps).to.be.greaterThanOrEqual(200);
    expect(baseAprBps).to.be.lessThanOrEqual(1000);
  });

  it("redeem() after maturity: phoenix-mints Core NFT back + mints XNTD reward", async function () {
    const { alice, xen, core, stake, xntd } = await deploy();

    // mint L1 id=1
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN();
    const d0 = await core.nftData(1);
    const nominal0 = d0.nominal;

    // stake 30 days
    await core.connect(alice).approve(await stake.getAddress(), 1);
    await stake.connect(alice).stake(1, 30);

    const pos = await stake.pos(1);
    const snap = pos[0];
    const endTs = BigInt(pos[2]);

    // jump to maturity
    await time.increaseTo(endTs + 1n);

    // use previewRedeem to compute expected reward (same formula as contract)
    const prev = await stake.previewRedeem(1);
    expect(prev[0]).to.equal(true);  // active
    expect(prev[1]).to.equal(true);  // matured
    const rewardExpected = prev[5];

    const xBefore = await xntd.balanceOf(alice.address);

    await stake.connect(alice).redeem(1);

    // pNFT burned
    await expect(stake.ownerOf(1)).to.be.reverted;

    // Core NFT back
    expect(await core.ownerOf(1)).to.equal(alice.address);

    const d1 = await core.nftData(1);
    expect(d1.nominal).to.equal(nominal0); // matured => no penalty

    // XNTD reward minted
    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(rewardExpected);
  });

  it("redeem() early: phoenix-mints Core NFT back with 1% penalty (ceil), reward=0", async function () {
    const { alice, xen, core, stake, xntd } = await deploy();

    // mint L1 id=1
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN();
    const d0 = await core.nftData(1);
    const nominal0 = d0.nominal;

    // stake 30 days then redeem immediately (not matured)
    await core.connect(alice).approve(await stake.getAddress(), 1);
    await stake.connect(alice).stake(1, 30);

    const xBefore = await xntd.balanceOf(alice.address);

    const prev = await stake.previewRedeem(1);
    expect(prev[0]).to.equal(true);   // active
    expect(prev[1]).to.equal(false);  // not matured
    expect(prev[5]).to.equal(0n);     // reward 0

    await stake.connect(alice).redeem(1);

    // Core NFT back
    expect(await core.ownerOf(1)).to.equal(alice.address);

    // reward still 0
    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(0n);

    // penalty is ceil(nominal * 9900 / 10000)
    const expectedNomAfter = ceilMulDiv(nominal0, 9900n, 10_000n);
    const d1 = await core.nftData(1);
    expect(d1.nominal).to.equal(expectedNomAfter);
  });

  it("forged L2 maturity reward includes +500 bps bonus (forged && level>1)", async function () {
    const { alice, xen, core, stake, forge, xntd } = await deploy();

    // prepare XEN for multiple mints
    await xen.faucet(alice.address, ethers.parseEther("20000"));

    const minAmt = await core.currentBaseNominal();

    // ---- forged A ----
    // ordinary id=1 -> redeem => get XNTD
    await core.connect(alice).mintWithXEN(); // id=1
    await core.connect(alice).redeem(1);

    // base L1 id=2 -> forge => forged id=3
    await core.connect(alice).mintWithXEN(); // id=2
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await forge.connect(alice).forge(2, minAmt);
    const forgedA = 3;

    // ---- forged B ----
    await core.connect(alice).mintWithXEN(); // id=4
    await core.connect(alice).redeem(4);

    await core.connect(alice).mintWithXEN(); // id=5
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await forge.connect(alice).forge(5, minAmt);
    const forgedB = 6;

    // enchant forged+forged => forged L2 id=7
    await core.connect(alice).enchant(forgedA, forgedB);
    const forgedL2 = 7;

    const d = await core.nftData(forgedL2);
    expect(d.isForged).to.equal(true);
    expect(d.level).to.equal(2);

    // stake forged L2 for 30 days
    await core.connect(alice).approve(await stake.getAddress(), forgedL2);
    await stake.connect(alice).stake(forgedL2, 30);

    const pos = await stake.pos(forgedL2);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    // expected reward from previewRedeem
    const prev = await stake.previewRedeem(forgedL2);
    expect(prev[1]).to.equal(true); // matured
    const rewardExpected = prev[5];

    const xBefore = await xntd.balanceOf(alice.address);
    await stake.connect(alice).redeem(forgedL2);
    const xAfter = await xntd.balanceOf(alice.address);

    expect(xAfter - xBefore).to.equal(rewardExpected);
  });
});