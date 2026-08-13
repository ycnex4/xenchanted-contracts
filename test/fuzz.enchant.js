const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("Fuzz: enchant()", function () {

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


  function rnd(max) {
    return Math.floor(Math.random() * max);
  }

  it("fuzz enchant scenarios", async function () {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const env = await deploy();
      const { alice, core } = env;

      const scenario = rnd(5);

      if (scenario === 0) {
        const id = await mintL1(env, alice);
        await expect(core.connect(alice).enchant(id, id)).to.be.revertedWith("SAME");
      }

      else if (scenario === 1) {
        const id1 = await mintL1(env, alice);
        const id2 = await mintL1(env, alice);

        const a = await core.nftData(id1);
        const b = await core.nftData(id2);
        const expectedNom = ((a.nominal + b.nominal) / 2n) * 3n;

        const newId = await enchant(env, id1, id2, alice);

        expect(await core.ownerOf(newId)).to.equal(alice.address);
        const d = await core.nftData(newId);

        expect(d.level).to.equal(2);
        expect(d.isForged).to.equal(false);
        expect(d.nominal).to.equal(expectedNom);
      }

      else if (scenario === 2) {
        const id1 = await mintL1(env, alice);
        const id2 = await mintL1(env, alice);
        const id3 = await mintL1(env, alice);

        const l2Id = await enchant(env, id1, id2, alice);

        await expect(core.connect(alice).enchant(l2Id, id3)).to.be.revertedWith("LVL");
      }

      else if (scenario === 3) {
        const forgedId = await forgeOne(env);
        const ordinaryId = await mintL1(env, alice);

        await expect(core.connect(alice).enchant(forgedId, ordinaryId)).to.be.revertedWith("TYPE");
      }

      else if (scenario === 4) {
        const forgedA = await forgeOne(env);
        const forgedB = await forgeOne(env);

        const a = await core.nftData(forgedA);
        const b = await core.nftData(forgedB);

        const expectedNom = a.nominal + b.nominal;
        const expectedBurn = a.xntdBurned + b.xntdBurned;

        const newId = await enchant(env, forgedA, forgedB, alice);
        const d = await core.nftData(newId);

        expect(d.level).to.equal(2);
        expect(d.isForged).to.equal(true);
        expect(d.nominal).to.equal(expectedNom);
        expect(d.xenBurned).to.equal(0n);
        expect(d.xntdBurned).to.equal(expectedBurn);
      }
    }
  });
});
