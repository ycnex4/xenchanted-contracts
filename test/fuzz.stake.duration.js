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

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { alice, xen, core, stake };
  }

  function randomDuration() {
    return Math.floor(Math.random() * 1000);
  }

  async function mintOrdinaryL2(env) {
    const { alice, xen, core } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id=1
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    await core.connect(alice).mintWithXEN(); // id=2
    await core.connect(alice).enchant(1, 2); // id=3

    return 3;
  }

  it("fuzz stake durations", async function () {
    const ITERATIONS = 50;

    for (let i = 0; i < ITERATIONS; i++) {
      const env = await deploy();
      const { alice, core, stake } = env;

      const tokenId = await mintOrdinaryL2(env);
      const duration = randomDuration();

      await core.connect(alice).approve(await stake.getAddress(), tokenId);

      if (duration < 30) {
        await expect(
          stake.connect(alice).stake(tokenId, duration)
        ).to.be.revertedWith("DUR_MIN");
      } else if (duration > 730) {
        await expect(
          stake.connect(alice).stake(tokenId, duration)
        ).to.be.revertedWith("DUR_MAX");
      } else {
        await stake.connect(alice).stake(tokenId, duration);

        const pos = await stake.pos(tokenId);
        expect(pos.active).to.equal(true);

        const view = await stake.getStakeView(tokenId);
        expect(view.durationDays).to.equal(duration);
        expect(view.expectedReward).to.be.greaterThan(0n);
        expect(view.availableReward).to.equal(0n);
      }
    }
  });
});
