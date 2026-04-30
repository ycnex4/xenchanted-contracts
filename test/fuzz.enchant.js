const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fuzz: enchant()", function () {
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

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { alice, xen, core, xntd, stake, forge };
  }

  function rnd(max) {
    return Math.floor(Math.random() * max);
  }

  async function makeOrdinaryL1(env) {
    const { alice, xen, core } = env;
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN();
  }

  async function makeForgedL1Pair(env) {
    const { alice, xen, core, xntd, forge } = env;

    await xen.faucet(alice.address, ethers.parseEther("5000"));

    // 1 ordinary -> redeem => XNTD
    await core.connect(alice).mintWithXEN(); // id=1
    await core.connect(alice).redeem(1);

    // base ordinary -> forge => forged id=3
    await core.connect(alice).mintWithXEN(); // id=2
    const minAmt = await core.currentBaseNominal();
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await forge.connect(alice).forge(2, minAmt);
    const forgedA = 3;

    // again
    await core.connect(alice).mintWithXEN(); // id=4
    await core.connect(alice).redeem(4);

    await core.connect(alice).mintWithXEN(); // id=5
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await forge.connect(alice).forge(5, minAmt);
    const forgedB = 6;

    return { forgedA, forgedB };
  }

  it("fuzz enchant scenarios", async function () {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const env = await deploy();
      const { alice, core, xen, xntd, forge } = env;

      const scenario = rnd(5);

      // 0 = SAME
      if (scenario === 0) {
        await makeOrdinaryL1(env); // id=1
        await expect(core.connect(alice).enchant(1, 1)).to.be.revertedWith("SAME");
      }

      // 1 = ordinary + ordinary success
      else if (scenario === 1) {
        await xen.faucet(alice.address, ethers.parseEther("5000"));
        await core.connect(alice).mintWithXEN(); // 1
        await core.connect(alice).mintWithXEN(); // 2

        const a = await core.nftData(1);
        const b = await core.nftData(2);
        const expectedNom = ((a.nominal + b.nominal) / 2n) * 3n;

        await core.connect(alice).enchant(1, 2);

        expect(await core.ownerOf(3)).to.equal(alice.address);
        const d = await core.nftData(3);

        expect(d.level).to.equal(2);
        expect(d.isForged).to.equal(false);
        expect(d.nominal).to.equal(expectedNom);
      }

      // 2 = LVL mismatch
      else if (scenario === 2) {
        await xen.faucet(alice.address, ethers.parseEther("5000"));
        await core.connect(alice).mintWithXEN(); // 1
        await core.connect(alice).mintWithXEN(); // 2
        await core.connect(alice).mintWithXEN(); // 3

        await core.connect(alice).enchant(1, 2); // => 4 level 2

        await expect(core.connect(alice).enchant(4, 3)).to.be.revertedWith("LVL");
      }

      // 3 = TYPE mismatch
      else if (scenario === 3) {
        await xen.faucet(alice.address, ethers.parseEther("5000"));

        // ordinary id=1
        await core.connect(alice).mintWithXEN();

        // get XNTD from another ordinary
        await core.connect(alice).mintWithXEN(); // id=2
        await core.connect(alice).redeem(2);

        const minAmt = await core.currentBaseNominal();
        await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

        // forge using id=1 => forged id=3
        await forge.connect(alice).forge(1, minAmt);

        // mint new ordinary id=4
        await core.connect(alice).mintWithXEN();

        await expect(core.connect(alice).enchant(3, 4)).to.be.revertedWith("TYPE");
      }

      // 4 = forged + forged success
      else if (scenario === 4) {
        const { forgedA, forgedB } = await makeForgedL1Pair(env);

        const a = await core.nftData(forgedA);
        const b = await core.nftData(forgedB);

        const expectedNom = a.nominal + b.nominal;
        const expectedBurn = a.xntdBurned + b.xntdBurned;

        const tx = await core.connect(alice).enchant(forgedA, forgedB);
        const rc = await tx.wait();

        const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");
        expect(log).to.not.equal(undefined);

        const newId = log.args.id;
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