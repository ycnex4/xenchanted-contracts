const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("XNTDToken - protocol burn paths", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("100000000");

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

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return {
      deployer,
      alice,
      xen,
      core,
      xntd,
      stake,
      forge,
      initialNominal,
      initialXenBurn,
    };
  }

  async function mintL1(env, who = env.alice) {
    await env.xen.faucet(who.address, env.initialXenBurn);
    await env.xen.connect(who).approve(await env.core.getAddress(), await env.core.currentXenBurnAmount());

    const tx = await env.core.connect(who).mintWithXEN();
    const rc = await tx.wait();

    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Minted");
    return log.args.id;
  }

  async function fundXntd(env, amount) {
    while ((await env.xntd.balanceOf(env.alice.address)) < amount) {
      const id = await mintL1(env, env.alice);
      await env.core.connect(env.alice).redeem(id);
    }
  }

  it("allows mint only from Core", async function () {
    const { deployer, alice, xntd } = await deploy();

    await expect(
      xntd.connect(deployer).mint(alice.address, ethers.parseEther("1"))
    ).to.be.revertedWith("CORE");
  });

  it("binds Forge once during Core init", async function () {
    const { xntd, forge } = await deploy();

    expect(await xntd.FORGE()).to.equal(await forge.getAddress());
    expect(await xntd.forgeBound()).to.equal(true);
  });

  it("does not expose public self-burn", async function () {
    const env = await deploy();
    const { alice, xntd } = env;

    const id = await mintL1(env, alice);
    await env.core.connect(alice).redeem(id);

    const amount = ethers.parseEther("1");

    // XNTD has no burn(uint256).
    // Its burn(address,uint256) is XEN-style integrator burn and must reject EOA callers.
    await expect(
      xntd.connect(alice).burn(alice.address, amount)
    ).to.be.revertedWith("BURNER");
  });

  it("supports XEN-style integrator burn with allowance + callback", async function () {
    const env = await deploy();
    const { alice, xntd } = env;

    const id = await mintL1(env, alice);
    await env.core.connect(alice).redeem(id);

    const Integrator = await ethers.getContractFactory("MockXNTDBurnRedeemable");
    const integrator = await Integrator.deploy(await xntd.getAddress());

    const amount = ethers.parseEther("25");
    const beforeBal = await xntd.balanceOf(alice.address);

    await xntd.connect(alice).approve(await integrator.getAddress(), amount);
    await integrator.burnXNTD(alice.address, amount);

    expect(await xntd.balanceOf(alice.address)).to.equal(beforeBal - amount);
    expect(await xntd.userBurns(alice.address)).to.equal(amount);
    expect(await xntd.integratorBurns(await integrator.getAddress())).to.equal(amount);
    expect(await xntd.totalBurned()).to.equal(amount);

    expect(await integrator.lastUser()).to.equal(alice.address);
    expect(await integrator.lastAmount()).to.equal(amount);
    expect(await integrator.callbackCount()).to.equal(1n);
  });

  it("forge burns XNTD without ERC20 approval", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const amount = await forge.minForgeAmount();

    await fundXntd(env, amount);

    const baseId = await mintL1(env, alice);
    const beforeBal = await xntd.balanceOf(alice.address);

    expect(await xntd.allowance(alice.address, await forge.getAddress())).to.equal(0n);

    await forge.connect(alice).forge(baseId, amount);

    await expect(core.ownerOf(baseId)).to.be.reverted;
    expect(await xntd.balanceOf(alice.address)).to.equal(beforeBal - amount);
    expect(await xntd.userBurns(alice.address)).to.equal(amount);
    expect(await xntd.forgeBurned()).to.equal(amount);
    expect(await xntd.totalBurned()).to.equal(amount);
  });
});
