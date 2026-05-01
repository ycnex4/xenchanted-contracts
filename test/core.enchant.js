const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedNFT Core - ENCHANT (no mixing) tests", function () {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

    // 1) Deploy MockXEN
    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    // 2) Deploy Core
    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");
    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);

    // 3) Deploy XNTDToken(core)
    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    // 4) Deploy Stake(core)
    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    // 5) Deploy Forge(core, xntd)
    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    // 6) init Core
    // 6) Deploy URI lens contracts and wire them before Core init
    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    // 7) init Core
    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, bob, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  async function mintOrdinaryL1({ alice, xen, core }) {
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1 (если чистая сеть)
  }

  async function mintTwoOrdinarySameLevel({ alice, xen, core }) {
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1
    await core.connect(alice).mintWithXEN(); // id=2
    return { id1: 1, id2: 2 };
  }

  async function mintTwoForgedSameLevel({ alice, xen, core, xntd, forge }) {
    // 1) mint two ordinary L1: ids 1 and 2
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // 1
    await core.connect(alice).mintWithXEN(); // 2

    // 2) give alice XNTD and approve forge
    // easiest: redeem some NFT to mint XNTD
    await core.connect(alice).redeem(2); // burns id=2, mints XNTD=nominal

    const xntdBal = await xntd.balanceOf(alice.address);
    expect(xntdBal).to.be.gt(0n);

    // approve forge for all balance (or enough)
    await xntd.connect(alice).approve(await forge.getAddress(), xntdBal);

    // 3) forge using baseId=1 -> forgedId=3
    const forgedId1 = await forge.connect(alice).forge.staticCall(1, xntdBal);
    await forge.connect(alice).forge(1, xntdBal);

    // mint another ordinary and redeem to get more XNTD, then forge again
    await core.connect(alice).mintWithXEN(); // next ordinary L1 (id=4)
    await core.connect(alice).redeem(4);     // mint more XNTD

    const xntdBal2 = await xntd.balanceOf(alice.address);
    await xntd.connect(alice).approve(await forge.getAddress(), xntdBal2);

    const forgedId2 = await forge.connect(alice).forge.staticCall(3 /* baseId must be ordinary L1 - so can't use forged */, xntdBal2)
      .catch(() => null);

    // Since Core forbids forging from forged (F1), we need another ordinary L1 as base
    await core.connect(alice).mintWithXEN(); // id=5
    const forgedIdB = await forge.connect(alice).forge.staticCall(5, xntdBal2);
    await forge.connect(alice).forge(5, xntdBal2);

    return { forgedA: forgedId1, forgedB: forgedIdB };
  }

  it("ordinary+ordinary (same level) => new ordinary, nominal = avg*3, level+1, parents set, olds burned", async function () {
    const { alice, xen, core, initialXenBurn } = await deploy();

    const { id1, id2 } = await mintTwoOrdinarySameLevel({ alice, xen, core });

    const a = await core.nftData(id1);
    const b = await core.nftData(id2);

    // preconditions
    expect(a.level).to.equal(1);
    expect(b.level).to.equal(1);
    expect(a.isForged).to.equal(false);
    expect(b.isForged).to.equal(false);

    const expectedAvg = (a.nominal + b.nominal) / 2n;
    const expectedNewNom = expectedAvg * 3n;

    // enchant -> should mint id=3
    await core.connect(alice).enchant(id1, id2);

    // olds burned
    await expect(core.ownerOf(id1)).to.be.reverted; // burned
    await expect(core.ownerOf(id2)).to.be.reverted;

    const newId = 3;
    expect(await core.ownerOf(newId)).to.equal(alice.address);

    const nd = await core.nftData(newId);
    expect(nd.level).to.equal(2);
    expect(nd.isForged).to.equal(false);
    expect(nd.nominal).to.equal(expectedNewNom);

    // xenBurned should sum for ordinary
    expect(nd.xenBurned).to.equal(a.xenBurned + b.xenBurned);
    expect(nd.xenBurned).to.equal(initialXenBurn * 2n);
    expect(nd.xntdBurned).to.equal(0n);

    // parents
    expect(nd.parentId1).to.equal(BigInt(id1));
    expect(nd.parentId2).to.equal(BigInt(id2));
  });

  it("forged+forged (same level) => new forged, nominal = A+B, level+1, xntdBurned sums, parents set", async function () {
  const { alice, xen, core, xntd, forge } = await deploy();

  await xen.faucet(alice.address, ethers.parseEther("2000"));

  // mint 3 ordinary L1: 1,2,3
  await core.connect(alice).mintWithXEN(); // 1
  await core.connect(alice).mintWithXEN(); // 2
  await core.connect(alice).mintWithXEN(); // 3

  // redeem 2 and 3 to get XNTD for forging
  await core.connect(alice).redeem(2);
  await core.connect(alice).redeem(3);

  const bal = await xntd.balanceOf(alice.address);
  expect(bal).to.be.gt(0n);

  const minAmt = await core.currentBaseNominal();
  expect(minAmt).to.be.gt(0n);

  const partA = minAmt;
  const partB = bal - minAmt;
  expect(partB).to.be.gte(minAmt);

  // approve full balance once
  await xntd.connect(alice).approve(await forge.getAddress(), bal);

  // forge A using baseId=1
  const forgedIdA = await forge.connect(alice).forge.staticCall(1, partA);
  await forge.connect(alice).forge(1, partA);

  // mint another ordinary base for second forge
  await core.connect(alice).mintWithXEN(); // 5 (ordinary L1)

  const forgedIdB = await forge.connect(alice).forge.staticCall(5, partB);
  await forge.connect(alice).forge(5, partB);

  // load forged data
  const a = await core.nftData(forgedIdA);
  const b = await core.nftData(forgedIdB);

  expect(a.isForged).to.equal(true);
  expect(b.isForged).to.equal(true);
  expect(a.level).to.equal(b.level);

  const expectedNom = a.nominal + b.nominal;
  const expectedBurn = a.xntdBurned + b.xntdBurned;

  // enchant and get new id from event
  const tx = await core.connect(alice).enchant(forgedIdA, forgedIdB);
  const rc = await tx.wait();

  const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");
  expect(log).to.not.equal(undefined);

  const newId = log.args.id; // BigInt

  expect(await core.ownerOf(newId)).to.equal(alice.address);

  const nd = await core.nftData(newId);
  expect(nd.isForged).to.equal(true);
  expect(nd.level).to.equal(a.level + 1n); // 👈 BigInt
  expect(nd.nominal).to.equal(expectedNom);

  expect(nd.xenBurned).to.equal(0n);
  expect(nd.xntdBurned).to.equal(expectedBurn);

  expect(nd.parentId1).to.equal(forgedIdA);
  expect(nd.parentId2).to.equal(forgedIdB);
});

  it("enchant reverts on LVL mismatch", async function () {
    const { alice, xen, core } = await deploy();

    // mint 3 ordinary: ids 1,2,3
    await xen.faucet(alice.address, ethers.parseEther("2000"));
    await core.connect(alice).mintWithXEN(); // 1
    await core.connect(alice).mintWithXEN(); // 2
    await core.connect(alice).mintWithXEN(); // 3

    // enchant 1+2 => id=4 level 2
    await core.connect(alice).enchant(1, 2);

    // now try enchant (4 lvl2) with (3 lvl1)
    await expect(core.connect(alice).enchant(4, 3)).to.be.revertedWith("LVL");
  });

  it("enchant reverts if not owner (O1/O2)", async function () {
    const { alice, bob, xen, core } = await deploy();

    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // 1
    await core.connect(alice).mintWithXEN(); // 2

    // transfer 2 to bob
    await core.connect(alice).transferFrom(alice.address, bob.address, 2);

    // alice no longer owns 2 => should revert O2
    await expect(core.connect(alice).enchant(1, 2)).to.be.revertedWith("O2");
  });

  it("enchant reverts on SAME id", async function () {
    const { alice, xen, core } = await deploy();

    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // 1

    await expect(core.connect(alice).enchant(1, 1)).to.be.revertedWith("SAME");
  });

  it("enchant reverts on TYPE mismatch (no mixing)", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    await xen.faucet(alice.address, ethers.parseEther("2000"));
    // ordinary ids 1,2
    await core.connect(alice).mintWithXEN(); // 1
    await core.connect(alice).mintWithXEN(); // 2

    // redeem 2 -> get XNTD
    await core.connect(alice).redeem(2);
    const bal = await xntd.balanceOf(alice.address);
    const minAmt = await core.currentBaseNominal();
    expect(bal).to.be.gte(minAmt);

    // forge using baseId=1 -> forgedId=3
    await xntd.connect(alice).approve(await forge.getAddress(), bal);
    const forgedId = await forge.connect(alice).forge.staticCall(1, minAmt);
    await forge.connect(alice).forge(1, minAmt);

    // minted forgedId is forged, mint a new ordinary for mixing attempt
    await core.connect(alice).mintWithXEN(); // next id (ordinary)

    const ordinaryId = Number(forgedId) + 1;

    // try enchant forged + ordinary => TYPE
    await expect(core.connect(alice).enchant(forgedId, ordinaryId)).to.be.revertedWith("TYPE");
  });
});
