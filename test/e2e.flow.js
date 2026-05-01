const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("xEnchanted - end-to-end flow", function () {

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


  it("ordinary enchant -> stake -> mature redeem, then ordinary redeem -> forge", async function () {
    const env = await deploy();
    const { alice, core, xntd, stake, forge } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    const d1 = await core.nftData(id1);
    const d2 = await core.nftData(id2);

    expect(d1.isForged).to.equal(false);
    expect(d2.isForged).to.equal(false);
    expect(d1.level).to.equal(1);
    expect(d2.level).to.equal(1);

    const l2Id = await enchant(env, id1, id2, alice);

    expect(await core.ownerOf(l2Id)).to.equal(alice.address);

    const dL2 = await core.nftData(l2Id);
    expect(dL2.isForged).to.equal(false);
    expect(dL2.level).to.equal(2);

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    await expect(core.ownerOf(l2Id)).to.be.reverted;
    expect(await stake.ownerOf(l2Id)).to.equal(alice.address);

    const prevBefore = await stake.previewRedeem(l2Id);
    expect(prevBefore[0]).to.equal(true);
    expect(prevBefore[1]).to.equal(false);
    expect(prevBefore[6]).to.be.gt(0n); // expectedReward
    expect(prevBefore[7]).to.equal(0n); // availableReward

    const pos = await stake.pos(l2Id);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    const prevAfter = await stake.previewRedeem(l2Id);
    expect(prevAfter[0]).to.equal(true);
    expect(prevAfter[1]).to.equal(true);

    const rewardExpected = prevAfter[7];
    const xntdBeforeStakeRedeem = await xntd.balanceOf(alice.address);

    await stake.connect(alice).redeem(l2Id);

    await expect(stake.ownerOf(l2Id)).to.be.reverted;
    expect(await core.ownerOf(l2Id)).to.equal(alice.address);

    const xntdAfterStakeRedeem = await xntd.balanceOf(alice.address);
    expect(xntdAfterStakeRedeem - xntdBeforeStakeRedeem).to.equal(rewardExpected);

    const dAfter = await core.nftData(l2Id);
    expect(dAfter.isForged).to.equal(false);
    expect(dAfter.level).to.equal(2);

    const minAmt = await forge.minForgeAmount();
    expect(minAmt).to.equal((await core.currentBaseNominal()) * 5n);

    await fundXntd(env, minAmt);

    const baseId = await mintL1(env, alice);
    const beforeForgeBal = await xntd.balanceOf(alice.address);

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    const forgedId = await forge.connect(alice).forge.staticCall(baseId, minAmt);
    await forge.connect(alice).forge(baseId, minAmt);

    expect(await core.ownerOf(forgedId)).to.equal(alice.address);

    const forgedData = await core.nftData(forgedId);
    expect(forgedData.isForged).to.equal(true);
    expect(forgedData.level).to.equal(1);
    expect(forgedData.nominal).to.equal(minAmt);
    expect(forgedData.xenBurned).to.equal(0n);
    expect(forgedData.xntdBurned).to.equal(minAmt);

    expect(await xntd.balanceOf(alice.address)).to.equal(beforeForgeBal - minAmt);
  });

  it("forged L2 -> stake -> mature redeem gives forged bonus reward", async function () {
    const env = await deploy();
    const { alice, core, xntd, stake } = env;

    const forgedA = await forgeOne(env);
    const forgedB = await forgeOne(env);

    const forgedL2 = await enchant(env, forgedA, forgedB, alice);

    const d = await core.nftData(forgedL2);
    expect(d.isForged).to.equal(true);
    expect(d.level).to.equal(2);

    await core.connect(alice).approve(await stake.getAddress(), forgedL2);
    await stake.connect(alice).stake(forgedL2, 30);

    const pos = await stake.pos(forgedL2);
    const endTs = BigInt(pos[2]);

    await time.increaseTo(endTs + 1n);

    const preview = await stake.previewRedeem(forgedL2);
    expect(preview[1]).to.equal(true);

    const rewardExpected = preview[7];

    const before = await xntd.balanceOf(alice.address);
    await stake.connect(alice).redeem(forgedL2);
    const after = await xntd.balanceOf(alice.address);

    expect(after - before).to.equal(rewardExpected);

    expect(await core.ownerOf(forgedL2)).to.equal(alice.address);

    const dAfter = await core.nftData(forgedL2);
    expect(dAfter.isForged).to.equal(true);
    expect(dAfter.level).to.equal(2);
  });
});
