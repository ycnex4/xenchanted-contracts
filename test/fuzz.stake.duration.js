const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fuzz: stake duration", function () {

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

    return { alice, xen, core, stake };
  }

  function randomDuration() {
    return Math.floor(Math.random() * 1000); 
  }

  it("fuzz stake durations", async function () {

    const ITERATIONS = 50;

    for (let i = 0; i < ITERATIONS; i++) {

      const { alice, xen, core, stake } = await deploy();

      await xen.faucet(alice.address, ethers.parseEther("1000"));
      await core.connect(alice).mintWithXEN();

      const duration = randomDuration();

      await core.connect(alice).approve(await stake.getAddress(), 1);

      if (duration < 30) {

        await expect(
          stake.connect(alice).stake(1, duration)
        ).to.be.revertedWith("DUR_MIN");

      } else if (duration > 730) {

        await expect(
          stake.connect(alice).stake(1, duration)
        ).to.be.revertedWith("DUR_MAX");

      } else {

        await stake.connect(alice).stake(1, duration);

        const pos = await stake.pos(1);
        expect(pos.active).to.equal(true);

      }
    }

  });

});