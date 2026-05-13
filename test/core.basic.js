const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedNFT Core - basic flow with XEN burn()", function () {

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


  it("mintWithXEN reverts without XEN allowance", async function () {
    const env = await deploy();
    const { alice, xen, core } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000"));

    await expect(
      core.connect(alice).mintWithXEN()
    ).to.be.revertedWithCustomError(xen, "ERC20InsufficientAllowance");
  });


  it("mintWithXEN burns XEN via burn() + callback, and mints L1 NFT", async function () {
    const env = await deploy();
    const { alice, xen, core, initialXenBurn } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000"));
    const before = await xen.balanceOf(alice.address);

    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());

    const tx = await core.connect(alice).mintWithXEN();
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Minted");
    const id = log.args.id;

    const after = await xen.balanceOf(alice.address);
    expect(before - after).to.equal(initialXenBurn);

    expect(await xen.lastBurnCaller()).to.equal(await core.getAddress());
    expect(await xen.lastBurnUser()).to.equal(alice.address);
    expect(await xen.lastBurnAmount()).to.equal(initialXenBurn);

    expect(await core.ownerOf(id)).to.equal(alice.address);

    const d = await core.nftData(id);
    expect(d.level).to.equal(1);
    expect(d.isForged).to.equal(false);
    expect(d.nominal).to.not.equal(0n);
    expect(d.xenBurned).to.equal(initialXenBurn);
  });

  it("EOA cannot call XEN.burn directly (must be IBurnRedeemable contract)", async function () {
    const { alice, xen } = await deploy();

    await xen.faucet(alice.address, ethers.parseEther("1000"));

    await expect(
      xen.connect(alice).burn(alice.address, ethers.parseEther("10"))
    ).to.be.revertedWith("Burn: not a supported contract");
  });

  it("redeem burns NFT and mints XNTD = nominal", async function () {
    const env = await deploy();
    const { alice, core, xntd } = env;

    const id = await mintL1(env, alice);
    const dBefore = await core.nftData(id);
    const nom = dBefore.nominal;

    const balBefore = await xntd.balanceOf(alice.address);
    await core.connect(alice).redeem(id);

    const balAfter = await xntd.balanceOf(alice.address);
    expect(balAfter - balBefore).to.equal(nom);

    await expect(core.ownerOf(id)).to.be.reverted;

    const dAfter = await core.nftData(id);
    expect(dAfter.level).to.equal(0);
    expect(dAfter.nominal).to.equal(0n);
  });

  it("redeem reverts if caller is not owner", async function () {
    const env = await deploy();
    const { deployer, alice, core } = env;

    const id = await mintL1(env, alice);

    await expect(core.connect(deployer).redeem(id)).to.be.revertedWith("OWN");
  });

  it("enchant reverts on TYPE mismatch (no mixing)", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const forgedId = await forgeOne(env);
    const ordinaryId = await mintL1(env, alice);

    const f = await core.nftData(forgedId);
    const o = await core.nftData(ordinaryId);
    expect(f.isForged).to.equal(true);
    expect(o.isForged).to.equal(false);

    await expect(core.connect(alice).enchant(ordinaryId, forgedId)).to.be.revertedWith("TYPE");
  });
});
