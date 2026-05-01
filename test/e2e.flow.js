const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("xEnchanted - end-to-end flow", function () {
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

    return { deployer, alice, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  it("ordinary enchant -> stake -> mature redeem, then ordinary redeem -> forge", async function () {
    const { alice, xen, core, xntd, stake, forge } = await deploy();

    await xen.faucet(alice.address, ethers.parseEther("10000"));

    // -----------------------------
    // PART 1: ordinary -> enchant -> stake -> mature redeem
    // -----------------------------

    // mint two ordinary L1: id=1, id=2
    await core.connect(alice).mintWithXEN();
    await core.connect(alice).mintWithXEN();

    const d1 = await core.nftData(1);
    const d2 = await core.nftData(2);

    expect(d1.isForged).to.equal(false);
    expect(d2.isForged).to.equal(false);
    expect(d1.level).to.equal(1);
    expect(d2.level).to.equal(1);

    // enchant 1 + 2 => id=3 ordinary L2
    await core.connect(alice).enchant(1, 2);

    expect(await core.ownerOf(3)).to.equal(alice.address);

    const d3 = await core.nftData(3);
    expect(d3.isForged).to.equal(false);
    expect(d3.level).to.equal(2);

    // stake id=3 for 30 days
    await core.connect(alice).approve(await stake.getAddress(), 3);
    await stake.connect(alice).stake(3, 30);

    // now Core NFT 3 burned, pNFT 3 exists
    await expect(core.ownerOf(3)).to.be.reverted;
    expect(await stake.ownerOf(3)).to.equal(alice.address);

    // preview before maturity
    const prevBefore = await stake.previewRedeem(3);
    expect(prevBefore[0]).to.equal(true);  // active
    expect(prevBefore[1]).to.equal(false); // not matured

    const pos = await stake.pos(3);
    const endTs = BigInt(pos[2]);

    // travel to maturity
    await time.increaseTo(endTs + 1n);

    const prevAfter = await stake.previewRedeem(3);
    expect(prevAfter[0]).to.equal(true);
    expect(prevAfter[1]).to.equal(true);

    const rewardExpected = prevAfter[7];
    const xntdBeforeStakeRedeem = await xntd.balanceOf(alice.address);

    // redeem stake
    await stake.connect(alice).redeem(3);

    // pNFT burned, Core NFT returned
    await expect(stake.ownerOf(3)).to.be.reverted;
    expect(await core.ownerOf(3)).to.equal(alice.address);

    // reward minted
    const xntdAfterStakeRedeem = await xntd.balanceOf(alice.address);
    expect(xntdAfterStakeRedeem - xntdBeforeStakeRedeem).to.equal(rewardExpected);

    const d3After = await core.nftData(3);
    expect(d3After.isForged).to.equal(false);
    expect(d3After.level).to.equal(2);

    // -----------------------------
    // PART 2: ordinary -> redeem -> forge
    // -----------------------------

    // mint new ordinary L1 id=4
    await core.connect(alice).mintWithXEN();
    expect(await core.ownerOf(4)).to.equal(alice.address);

    const d4 = await core.nftData(4);
    expect(d4.isForged).to.equal(false);
    expect(d4.level).to.equal(1);

    // redeem id=4 => get XNTD
    const xntdBeforeRedeem = await xntd.balanceOf(alice.address);
    await core.connect(alice).redeem(4);
    const xntdAfterRedeem = await xntd.balanceOf(alice.address);

    expect(xntdAfterRedeem - xntdBeforeRedeem).to.equal(d4.nominal);

    // mint new ordinary L1 id=5 to use as forge base
    await core.connect(alice).mintWithXEN();
    expect(await core.ownerOf(5)).to.equal(alice.address);

    const minAmt = await forge.minForgeAmount();
    expect(minAmt).to.equal(await core.currentBaseNominal());

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    const forgedId = await forge.connect(alice).forge.staticCall(5, minAmt);
    await forge.connect(alice).forge(5, minAmt);

    expect(await core.ownerOf(forgedId)).to.equal(alice.address);

    const forgedData = await core.nftData(forgedId);
    expect(forgedData.isForged).to.equal(true);
    expect(forgedData.level).to.equal(1);
    expect(forgedData.nominal).to.equal(minAmt);
    expect(forgedData.xenBurned).to.equal(0n);
    expect(forgedData.xntdBurned).to.equal(minAmt);
  });

  it("forged L2 -> stake -> mature redeem gives forged bonus reward", async function () {
  const { alice, xen, core, xntd, stake, forge } = await deploy();

  await xen.faucet(alice.address, ethers.parseEther("20000"));

  const minAmt = await core.currentBaseNominal();

  // ---------- build forged L2 ----------

  // ordinary -> redeem -> get XNTD
  await core.connect(alice).mintWithXEN(); // id=1
  await core.connect(alice).redeem(1);

  // forge A
  await core.connect(alice).mintWithXEN(); // id=2
  await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
  await forge.connect(alice).forge(2, minAmt);
  const forgedA = 3;

  // ordinary -> redeem
  await core.connect(alice).mintWithXEN(); // id=4
  await core.connect(alice).redeem(4);

  // forge B
  await core.connect(alice).mintWithXEN(); // id=5
  await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
  await forge.connect(alice).forge(5, minAmt);
  const forgedB = 6;

  // enchant forgedA + forgedB -> forged L2
  await core.connect(alice).enchant(forgedA, forgedB);
  const forgedL2 = 7;

  const d = await core.nftData(forgedL2);
  expect(d.isForged).to.equal(true);
  expect(d.level).to.equal(2);

  // ---------- stake forged L2 ----------

  await core.connect(alice).approve(await stake.getAddress(), forgedL2);
  await stake.connect(alice).stake(forgedL2, 30);

  const pos = await stake.pos(forgedL2);
  const endTs = BigInt(pos[2]);

  // ---------- mature ----------

  await time.increaseTo(endTs + 1n);

  const preview = await stake.previewRedeem(forgedL2);
  expect(preview[1]).to.equal(true); // matured

  const rewardExpected = preview[7];

  const before = await xntd.balanceOf(alice.address);

  await stake.connect(alice).redeem(forgedL2);

  const after = await xntd.balanceOf(alice.address);

  expect(after - before).to.equal(rewardExpected);

  // NFT returned via phoenix mint
  expect(await core.ownerOf(forgedL2)).to.equal(alice.address);

  const dAfter = await core.nftData(forgedL2);
  expect(dAfter.isForged).to.equal(true);
  expect(dAfter.level).to.equal(2);
});
});
