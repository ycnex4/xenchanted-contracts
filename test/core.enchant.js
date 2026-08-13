const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("xEnchantedNFT Core - ENCHANT (no mixing) tests", function () {

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


  it("ordinary+ordinary (same level) => new ordinary, nominal = avg*3, level+1, parents set, olds burned", async function () {
    const env = await deploy();
    const { alice, core, initialXenBurn } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    const a = await core.nftData(id1);
    const b = await core.nftData(id2);

    expect(a.level).to.equal(1);
    expect(b.level).to.equal(1);
    expect(a.isForged).to.equal(false);
    expect(b.isForged).to.equal(false);

    const expectedAvg = (a.nominal + b.nominal) / 2n;
    const expectedNewNom = expectedAvg * 3n;

    const newId = await enchant(env, id1, id2, alice);

    await expect(core.ownerOf(id1)).to.be.reverted;
    await expect(core.ownerOf(id2)).to.be.reverted;
    expect(await core.ownerOf(newId)).to.equal(alice.address);

    const nd = await core.nftData(newId);
    expect(nd.level).to.equal(2);
    expect(nd.isForged).to.equal(false);
    expect(nd.nominal).to.equal(expectedNewNom);

    expect(nd.xenBurned).to.equal(a.xenBurned + b.xenBurned);
    expect(nd.xenBurned).to.equal(initialXenBurn * 2n);
    expect(nd.xntdBurned).to.equal(0n);

    expect(nd.parentId1).to.equal(id1);
    expect(nd.parentId2).to.equal(id2);
  });

  it("forged+forged (same level) => new forged, nominal = A+B, level+1, xntdBurned sums, parents set", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const forgedA = await forgeOne(env);
    const forgedB = await forgeOne(env);

    const a = await core.nftData(forgedA);
    const b = await core.nftData(forgedB);

    expect(a.isForged).to.equal(true);
    expect(b.isForged).to.equal(true);
    expect(a.level).to.equal(b.level);

    const expectedNom = a.nominal + b.nominal;
    const expectedBurn = a.xntdBurned + b.xntdBurned;

    const newId = await enchant(env, forgedA, forgedB, alice);

    expect(await core.ownerOf(newId)).to.equal(alice.address);

    const nd = await core.nftData(newId);
    expect(nd.isForged).to.equal(true);
    expect(nd.level).to.equal(a.level + 1n);
    expect(nd.nominal).to.equal(expectedNom);

    expect(nd.xenBurned).to.equal(0n);
    expect(nd.xntdBurned).to.equal(expectedBurn);

    expect(nd.parentId1).to.equal(forgedA);
    expect(nd.parentId2).to.equal(forgedB);
  });

  it("enchant reverts on LVL mismatch", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);
    const id3 = await mintL1(env, alice);

    const l2Id = await enchant(env, id1, id2, alice);

    await expect(core.connect(alice).enchant(l2Id, id3)).to.be.revertedWith("LVL");
  });

  it("enchant reverts if not owner (O1/O2)", async function () {
    const env = await deploy();
    const { alice, bob, core } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    await core.connect(alice).transferFrom(alice.address, bob.address, id2);

    await expect(core.connect(alice).enchant(id1, id2)).to.be.revertedWith("O2");
  });

  it("enchant reverts on SAME id", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const id = await mintL1(env, alice);

    await expect(core.connect(alice).enchant(id, id)).to.be.revertedWith("SAME");
  });

  it("enchant reverts on TYPE mismatch (no mixing)", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const forgedId = await forgeOne(env);
    const ordinaryId = await mintL1(env, alice);

    await expect(core.connect(alice).enchant(forgedId, ordinaryId)).to.be.revertedWith("TYPE");
  });
});
