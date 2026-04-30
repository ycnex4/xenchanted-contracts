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

    // 6) URI lenses are required before Core init / Stake tokenURI finalization
    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    // 7) init Core
    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  // ceil(n * a / b)
  function ceilMulDiv(n, a, b) {
    return (n * a + (b - 1n)) / b;
  }

  async function mintOrdinaryL2(env) {
    const { alice, xen, core } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000"));

    await core.connect(alice).mintWithXEN(); // id=1, L1
    await core.connect(alice).mintWithXEN(); // id=2, L1
    await core.connect(alice).enchant(1, 2); // id=3, L2

    return 3;
  }

  it("stake(): burns Core L2 NFT -> mints pNFT (same id), pos active", async function () {
    const env = await deploy();
    const { alice, core, stake } = env;

    const tokenId = await mintOrdinaryL2(env);

    // stake 30 days
    await core.connect(alice).approve(await stake.getAddress(), tokenId);
    await stake.connect(alice).stake(tokenId, 30);

    // Core NFT is burned
    await expect(core.ownerOf(tokenId)).to.be.reverted;

    // Stake position NFT exists
    expect(await stake.ownerOf(tokenId)).to.equal(alice.address);

    const p = await stake.pos(tokenId);
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

    const view = await stake.getStakeView(tokenId);
    expect(view.durationDays).to.equal(30);
    expect(view.levelBonusBps).to.equal(100);
    expect(view.forgedBonusBps).to.equal(0);
    expect(view.totalAprBps).to.equal(baseAprBps + 100n);
    expect(view.expectedReward).to.be.greaterThan(0n);
    expect(view.availableReward).to.equal(0n);
  });

  it("redeem() after maturity: phoenix-mints Core NFT back + mints XNTD reward", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const tokenId = await mintOrdinaryL2(env);
    const d0 = await core.nftData(tokenId);
    const nominal0 = d0.nominal;

    // stake 30 days
    await core.connect(alice).approve(await stake.getAddress(), tokenId);
    await stake.connect(alice).stake(tokenId, 30);

    const pos = await stake.pos(tokenId);
    const endTs = BigInt(pos[2]);

    // jump to maturity
    await time.increaseTo(endTs + 1n);

    // previewRedeem returns expectedReward and availableReward separately
    const prev = await stake.previewRedeem(tokenId);
    expect(prev[0]).to.equal(true);  // active
    expect(prev[1]).to.equal(true);  // matured
    const rewardExpected = prev[6];  // expectedReward
    const rewardAvailable = prev[7]; // availableReward
    expect(rewardAvailable).to.equal(rewardExpected);

    const xBefore = await xntd.balanceOf(alice.address);

    await stake.connect(alice).redeem(tokenId);

    // pNFT burned
    await expect(stake.ownerOf(tokenId)).to.be.reverted;

    // Core NFT back
    expect(await core.ownerOf(tokenId)).to.equal(alice.address);

    const d1 = await core.nftData(tokenId);
    expect(d1.nominal).to.equal(nominal0); // matured => no penalty

    // XNTD reward minted
    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(rewardAvailable);
  });

  it("redeem() early: phoenix-mints Core NFT back with 1% penalty (ceil), reward=0", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const tokenId = await mintOrdinaryL2(env);
    const d0 = await core.nftData(tokenId);
    const nominal0 = d0.nominal;

    // stake 30 days then redeem immediately (not matured)
    await core.connect(alice).approve(await stake.getAddress(), tokenId);
    await stake.connect(alice).stake(tokenId, 30);

    const xBefore = await xntd.balanceOf(alice.address);

    const prev = await stake.previewRedeem(tokenId);
    expect(prev[0]).to.equal(true);   // active
    expect(prev[1]).to.equal(false);  // not matured
    expect(prev[6]).to.be.greaterThan(0n); // expectedReward exists before maturity
    expect(prev[7]).to.equal(0n);     // availableReward 0 before maturity

    await stake.connect(alice).redeem(tokenId);

    // Core NFT back
    expect(await core.ownerOf(tokenId)).to.equal(alice.address);

    // reward still 0
    const xAfter = await xntd.balanceOf(alice.address);
    expect(xAfter - xBefore).to.equal(0n);

    // penalty is ceil(nominal * 9900 / 10000)
    const expectedNomAfter = ceilMulDiv(nominal0, 9900n, 10_000n);
    const d1 = await core.nftData(tokenId);
    expect(d1.nominal).to.equal(expectedNomAfter);
  });

  it("forged L2 maturity reward includes +500 bps bonus", async function () {
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

    const view = await stake.getStakeView(forgedL2);
    expect(view.levelBonusBps).to.equal(100);
    expect(view.forgedBonusBps).to.equal(500);
    expect(view.totalAprBps).to.equal(view.baseAprBps + 600n);

    const pos = await stake.pos(forgedL2);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    // expected reward from previewRedeem
    const prev = await stake.previewRedeem(forgedL2);
    expect(prev[1]).to.equal(true); // matured
    const rewardExpected = prev[6];
    const rewardAvailable = prev[7];
    expect(rewardAvailable).to.equal(rewardExpected);

    const xBefore = await xntd.balanceOf(alice.address);
    await stake.connect(alice).redeem(forgedL2);
    const xAfter = await xntd.balanceOf(alice.address);

    expect(xAfter - xBefore).to.equal(rewardAvailable);
  });
});
