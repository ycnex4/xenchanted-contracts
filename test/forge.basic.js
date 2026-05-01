// test/forge.basic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedForge - basic tests", function () {
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

  async function fundXntd(env, targetAmount) {
    const { alice, xntd, core } = env;
    while ((await xntd.balanceOf(alice.address)) < targetAmount) {
      const id = await mintL1(env, alice);
      await core.connect(alice).redeem(id);
    }
  }

  it("forge params use production min/max multipliers", async function () {
    const { core, forge } = await deploy();

    const base = await core.currentBaseNominal();
    expect(await forge.MIN_FORGE_MULTIPLIER()).to.equal(5n);
    expect(await forge.MAX_FORGE_MULTIPLIER()).to.equal(1000n);
    expect(await forge.minForgeAmount()).to.equal(base * 5n);
    expect(await forge.maxForgeAmount()).to.equal(base * 1000n);

    const params = await forge.getForgeParams();
    expect(params.currentBaseNominal).to.equal(base);
    expect(params.minForgeAmount).to.equal(base * 5n);
    expect(params.maxForgeAmount).to.equal(base * 1000n);
    expect(params.minForgeMultiplier).to.equal(5n);
    expect(params.maxForgeMultiplier).to.equal(1000n);
  });

  it("forge() success: burns ordinary L1 + burns XNTD + mints forged L1 with nominal==burned", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const xntdAmount = await forge.minForgeAmount();
    await fundXntd(env, xntdAmount);
    const beforeBal = await xntd.balanceOf(alice.address);

    const baseId = await mintL1(env, alice);
    expect(await core.ownerOf(baseId)).to.equal(alice.address);

    await xntd.connect(alice).approve(await forge.getAddress(), xntdAmount);

    const tx = await forge.connect(alice).forge(baseId, xntdAmount);
    const rc = await tx.wait();

    await expect(core.ownerOf(baseId)).to.be.reverted;

    const forgeEvt = rc.logs
      .map((l) => {
        try {
          return forge.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((x) => x && x.name === "Forge");

    expect(forgeEvt).to.not.equal(null);
    const forgedId = forgeEvt.args.forgedId;

    expect(forgeEvt.args.currentBaseNominal).to.equal(await core.currentBaseNominal());
    expect(forgeEvt.args.minForgeAmount).to.equal(await forge.minForgeAmount());
    expect(forgeEvt.args.maxForgeAmount).to.equal(await forge.maxForgeAmount());
    expect(forgeEvt.args.xntdBurn).to.equal(xntdAmount);
    expect(forgeEvt.args.nominal).to.equal(xntdAmount);

    expect(await core.ownerOf(forgedId)).to.equal(alice.address);

    const fd = await core.nftData(forgedId);
    expect(fd.level).to.equal(1);
    expect(fd.isForged).to.equal(true);
    expect(fd.nominal).to.equal(xntdAmount);
    expect(fd.xenBurned).to.equal(0n);
    expect(fd.xntdBurned).to.equal(xntdAmount);

    const afterBal = await xntd.balanceOf(alice.address);
    expect(afterBal).to.equal(beforeBal - xntdAmount);
  });

  it("forge() reverts if ALLOW (no allowance)", async function () {
    const env = await deploy();
    const { alice, forge } = env;

    const minAmt = await forge.minForgeAmount();
    await fundXntd(env, minAmt);
    const baseId = await mintL1(env, alice);

    await expect(forge.connect(alice).forge(baseId, minAmt)).to.be.revertedWith("ALLOW");
  });

  it("forge() reverts if xntdAmount < MIN", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const minAmt = await forge.minForgeAmount();
    await fundXntd(env, minAmt);
    const baseId = await mintL1(env, alice);
    const tooSmall = minAmt - 1n;

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await expect(forge.connect(alice).forge(baseId, tooSmall)).to.be.revertedWith("MIN");

    expect(await core.ownerOf(baseId)).to.equal(alice.address);
  });

  it("forge() reverts if xntdAmount > MAX", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const maxAmt = await forge.maxForgeAmount();
    const tooLarge = maxAmt + 1n;
    const baseId = await mintL1(env, alice);

    await xntd.connect(alice).approve(await forge.getAddress(), tooLarge);
    await expect(forge.connect(alice).forge(baseId, tooLarge)).to.be.revertedWith("MAX");

    expect(await core.ownerOf(baseId)).to.equal(alice.address);
  });

  it("forge() reverts if baseId is not owned (Core should revert 'OF')", async function () {
    const env = await deploy();
    const { alice, bob, xntd, forge } = env;

    const minAmt = await forge.minForgeAmount();
    await fundXntd(env, minAmt);
    const bobBaseId = await mintL1(env, bob);

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await expect(forge.connect(alice).forge(bobBaseId, minAmt)).to.be.revertedWith("OF");
  });

  it("forge() reverts if baseId is forged (Core should revert 'F1')", async function () {
    const env = await deploy();
    const { alice, xntd, forge } = env;

    const minAmt = await forge.minForgeAmount();
    await fundXntd(env, minAmt);
    const baseId = await mintL1(env, alice);

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    const tx = await forge.connect(alice).forge(baseId, minAmt);
    const rc = await tx.wait();
    const forgeEvt = rc.logs
      .map((l) => {
        try {
          return forge.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((x) => x && x.name === "Forge");
    const forgedId = forgeEvt.args.forgedId;

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await expect(forge.connect(alice).forge(forgedId, minAmt)).to.be.revertedWith("F1");
  });

  it("forge() reverts if baseId is not L1 (Core should revert 'L1')", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);
    const tx = await core.connect(alice).enchant(id1, id2);
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");
    const l2Id = log.args.id;

    const d = await core.nftData(l2Id);
    expect(d.level).to.equal(2);
    expect(d.isForged).to.equal(false);

    const minAmt = await forge.minForgeAmount();
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    await expect(forge.connect(alice).forge(l2Id, minAmt)).to.be.revertedWith("L1");
  });
});
