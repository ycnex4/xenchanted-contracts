const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events - artifact lifecycle observability", function () {
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

    return { deployer, alice, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
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

  function findEvent(receipt, name) {
    return receipt.logs.find((l) => l.fragment && l.fragment.name === name);
  }

  function findParsedEvent(receipt, contract, name, predicate = null) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === name && (!predicate || predicate(parsed))) {
          return parsed;
        }
      } catch {
        // log belongs to another contract, ignore
      }
    }

    return null;
  }

  it("Minted event includes real burn footprint for Core L1", async function () {
    const env = await deploy();
    const { alice, xen, core, initialNominal, initialXenBurn } = env;

    await xen.faucet(alice.address, initialXenBurn);
    await xen.connect(alice).approve(await core.getAddress(), await core.currentXenBurnAmount());
    const tx = await core.connect(alice).mintWithXEN();
    const rc = await tx.wait();

    const evt = findEvent(rc, "Minted");
    expect(evt).to.not.equal(undefined);

    expect(evt.args.id).to.equal(1n);
    expect(evt.args.to).to.equal(alice.address);
    expect(evt.args.lvl).to.equal(1n);
    expect(evt.args.nom).to.equal(initialNominal);
    expect(evt.args.forged).to.equal(false);
    expect(evt.args.xenBurned).to.equal(initialXenBurn);
    expect(evt.args.xntdBurned).to.equal(0n);
  });

  it("Enchanted event includes owner and accumulated Core burn footprint", async function () {
    const env = await deploy();
    const { alice, core, initialXenBurn } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    const tx = await core.connect(alice).enchant(id1, id2);
    const rc = await tx.wait();

    const evt = findEvent(rc, "Enchanted");
    expect(evt).to.not.equal(undefined);

    const newId = evt.args.id;
    const nd = await core.nftData(newId);

    expect(evt.args.p1).to.equal(id1);
    expect(evt.args.p2).to.equal(id2);
    expect(evt.args.owner).to.equal(alice.address);
    expect(evt.args.lvl).to.equal(2n);
    expect(evt.args.nom).to.equal(nd.nominal);
    expect(evt.args.forged).to.equal(false);
    expect(evt.args.xenBurned).to.equal(initialXenBurn * 2n);
    expect(evt.args.xntdBurned).to.equal(0n);
  });

  it("Redeemed event includes type, level, nominal, minted XNTD and burn provenance", async function () {
    const env = await deploy();
    const { alice, core, xntd } = env;

    const id = await mintL1(env, alice);
    const d = await core.nftData(id);
    const before = await xntd.balanceOf(alice.address);

    const tx = await core.connect(alice).redeem(id);
    const rc = await tx.wait();

    const evt = findEvent(rc, "Redeemed");
    expect(evt).to.not.equal(undefined);

    expect(evt.args.id).to.equal(id);
    expect(evt.args.owner).to.equal(alice.address);
    expect(evt.args.forged).to.equal(false);
    expect(evt.args.level).to.equal(d.level);
    expect(evt.args.nominal).to.equal(d.nominal);
    expect(evt.args.xntdMinted).to.equal(d.nominal);
    expect(evt.args.xenBurned).to.equal(d.xenBurned);
    expect(evt.args.xntdBurned).to.equal(d.xntdBurned);
    expect(evt.args.xenBurned).to.equal(env.initialXenBurn);
    expect(evt.args.xntdBurned).to.equal(0n);

    expect((await xntd.balanceOf(alice.address)) - before).to.equal(evt.args.xntdMinted);
  });

    it("Redeemed event finalizes accumulated Core xenBurned after Enchant", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    const enchantTx = await core.connect(alice).enchant(id1, id2);
    const enchantRc = await enchantTx.wait();
    const enchantEvt = findEvent(enchantRc, "Enchanted");
    const l2Id = enchantEvt.args.id;

    const d = await core.nftData(l2Id);

    expect(d.isForged).to.equal(false);
    expect(d.level).to.equal(2n);
    expect(d.xenBurned).to.equal(env.initialXenBurn * 2n);
    expect(d.xntdBurned).to.equal(0n);

    const redeemTx = await core.connect(alice).redeem(l2Id);
    const redeemRc = await redeemTx.wait();
    const redeemEvt = findEvent(redeemRc, "Redeemed");

    expect(redeemEvt).to.not.equal(undefined);
    expect(redeemEvt.args.id).to.equal(l2Id);
    expect(redeemEvt.args.owner).to.equal(alice.address);
    expect(redeemEvt.args.forged).to.equal(false);
    expect(redeemEvt.args.level).to.equal(2n);
    expect(redeemEvt.args.nominal).to.equal(d.nominal);
    expect(redeemEvt.args.xntdMinted).to.equal(d.nominal);
    expect(redeemEvt.args.xenBurned).to.equal(env.initialXenBurn * 2n);
    expect(redeemEvt.args.xntdBurned).to.equal(0n);
  });

  it("StakeBurn and Phoenix events include artifact type, level and nominal context", async function () {
    const env = await deploy();
    const { alice, core, stake, xntd } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);
    await core.connect(alice).enchant(id1, id2);
    const stakedId = 3n;
    const d = await core.nftData(stakedId);

    await core.connect(alice).approve(await stake.getAddress(), stakedId);
    const stakeTx = await stake.connect(alice).stake(stakedId, 30);
    const stakeRc = await stakeTx.wait();

    const burnEvt = findParsedEvent(stakeRc, core, "StakeBurn");
    expect(burnEvt).to.not.equal(null);
    expect(burnEvt.args.id).to.equal(stakedId);
    expect(burnEvt.args.owner).to.equal(alice.address);
    expect(burnEvt.args.forged).to.equal(false);
    expect(burnEvt.args.level).to.equal(d.level);
    expect(burnEvt.args.nominal).to.equal(d.nominal);

    const pos = await stake.pos(stakedId);
    await time.increaseTo(BigInt(pos.endTs) + 1n);

    const before = await xntd.balanceOf(alice.address);
    const redeemTx = await stake.connect(alice).redeem(stakedId);
    const redeemRc = await redeemTx.wait();
    const after = await xntd.balanceOf(alice.address);

    const phoenixEvt = findParsedEvent(redeemRc, core, "Phoenix");
    expect(phoenixEvt).to.not.equal(null);
    expect(phoenixEvt.args.id).to.equal(stakedId);
    expect(phoenixEvt.args.to).to.equal(alice.address);
    expect(phoenixEvt.args.matured).to.equal(true);
    expect(phoenixEvt.args.forged).to.equal(false);
    expect(phoenixEvt.args.level).to.equal(d.level);
    expect(phoenixEvt.args.nomAfter).to.equal(d.nominal);
    expect(after - before).to.equal(phoenixEvt.args.reward);
  });

  it("ForgeMint and Minted events include XNTD burn footprint for forged L1", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const amount = await forge.minForgeAmount();
    await fundXntd(env, amount);
    const baseId = await mintL1(env, alice);

    const tx = await forge.connect(alice).forge(baseId, amount);
    const rc = await tx.wait();

    const forgeMintEvt = findParsedEvent(rc, core, "ForgeMint");
    expect(forgeMintEvt).to.not.equal(null);
    expect(forgeMintEvt.args.to).to.equal(alice.address);
    expect(forgeMintEvt.args.nom).to.equal(amount);
    expect(forgeMintEvt.args.xntdBurned).to.equal(amount);

    const mintedEvt = findParsedEvent(rc, core, "Minted", (evt) => evt.args.forged === true);
    expect(mintedEvt).to.not.equal(null);
    expect(mintedEvt.args.id).to.equal(forgeMintEvt.args.id);
    expect(mintedEvt.args.to).to.equal(alice.address);
    expect(mintedEvt.args.lvl).to.equal(1n);
    expect(mintedEvt.args.nom).to.equal(amount);
    expect(mintedEvt.args.forged).to.equal(true);
    expect(mintedEvt.args.xenBurned).to.equal(0n);
    expect(mintedEvt.args.xntdBurned).to.equal(amount);

    const fd = await core.nftData(mintedEvt.args.id);
    expect(fd.xntdBurned).to.equal(mintedEvt.args.xntdBurned);
    expect(await xntd.forgeBurned()).to.equal(amount);
  });

    it("Redeemed event preserves Forged XNTD burn provenance without XEN burn", async function () {
    const env = await deploy();
    const { alice, core, forge } = env;

    const amount = await forge.minForgeAmount();
    await fundXntd(env, amount);
    const baseId = await mintL1(env, alice);

    const forgeTx = await forge.connect(alice).forge(baseId, amount);
    const forgeRc = await forgeTx.wait();
    const mintedEvt = findParsedEvent(forgeRc, core, "Minted", (evt) => evt.args.forged === true);
    const forgedId = mintedEvt.args.id;

    const d = await core.nftData(forgedId);

    expect(d.isForged).to.equal(true);
    expect(d.xenBurned).to.equal(0n);
    expect(d.xntdBurned).to.equal(amount);

    const redeemTx = await core.connect(alice).redeem(forgedId);
    const redeemRc = await redeemTx.wait();
    const redeemEvt = findEvent(redeemRc, "Redeemed");

    expect(redeemEvt).to.not.equal(undefined);
    expect(redeemEvt.args.id).to.equal(forgedId);
    expect(redeemEvt.args.owner).to.equal(alice.address);
    expect(redeemEvt.args.forged).to.equal(true);
    expect(redeemEvt.args.level).to.equal(d.level);
    expect(redeemEvt.args.nominal).to.equal(d.nominal);
    expect(redeemEvt.args.xntdMinted).to.equal(d.nominal);
    expect(redeemEvt.args.xenBurned).to.equal(0n);
    expect(redeemEvt.args.xntdBurned).to.equal(amount);
  });
});
