// test/forge.basic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedForge - basic tests", function () {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

    // 1) Deploy MockXEN
    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    // 2) Deploy Core
    const initialNominal = ethers.parseEther("100"); // base nominal (epoch 0)
    const initialXenBurn = ethers.parseEther("10");  // xen burn for mintWithXEN
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

  async function mintOrdinaryL1({ xen, core, who }) {
    // give XEN and mint L1 ordinary
    await xen.faucet(who.address, ethers.parseEther("1000"));
    await core.connect(who).mintWithXEN();
    return 1; // first mint id in fresh fixture
  }

  it("forge() success: burns ordinary L1 + burns XNTD + mints forged L1 with nominal==burned", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    // mint ordinary L1 (id=1)
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN();
    expect(await core.ownerOf(1)).to.equal(alice.address);

    // mint XNTD to alice by redeeming an NFT (simple way to get real XNTD supply)
    // redeem will burn NFT#1, mint XNTD == nominal
    const d1 = await core.nftData(1);
    const aliceNominal = d1.nominal; // BigInt
    await core.connect(alice).redeem(1);
    expect(await xntd.balanceOf(alice.address)).to.equal(aliceNominal);

    // mint another ordinary L1 for baseId burn
    await core.connect(alice).mintWithXEN(); // this will mint id=2
    expect(await core.ownerOf(2)).to.equal(alice.address);

    // minForgeAmount == currentBaseNominal (epoch 0)
    const minAmt = await forge.minForgeAmount();
    expect(minAmt).to.equal(await core.currentBaseNominal());

    // choose xntdAmount >= minAmt
    const xntdAmount = minAmt;

    // approve forge to burnFrom
    await xntd.connect(alice).approve(await forge.getAddress(), xntdAmount);

    // forge using baseId=2
    const tx = await forge.connect(alice).forge(2, xntdAmount);
    const rc = await tx.wait();

    // base L1 burned (no longer exists)
    await expect(core.ownerOf(2)).to.be.reverted;

    // forged NFT minted next id=3 (since 1 burned, 2 burned; _nextId keeps increasing)
    // safer: parse event Forge(user, baseId, forgedId,...)
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

    expect(await core.ownerOf(forgedId)).to.equal(alice.address);

    const fd = await core.nftData(forgedId);
    expect(fd.level).to.equal(1);
    expect(fd.isForged).to.equal(true);
    expect(fd.nominal).to.equal(xntdAmount);
    expect(fd.xenBurned).to.equal(0n);
    expect(fd.xntdBurned).to.equal(xntdAmount);

    // XNTD burned from alice
    // (she had aliceNominal; after approving+burning xntdAmount)
    const afterBal = await xntd.balanceOf(alice.address);
    expect(afterBal).to.equal(aliceNominal - xntdAmount);
  });

  it("forge() reverts if ALLOW (no allowance)", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    // get some XNTD to alice by redeeming
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1
    const d1 = await core.nftData(1);
    await core.connect(alice).redeem(1);
    expect(await xntd.balanceOf(alice.address)).to.equal(d1.nominal);

    // mint base ordinary L1 (id=2)
    await core.connect(alice).mintWithXEN();

    const minAmt = await forge.minForgeAmount();
    // no approve here on purpose
    await expect(forge.connect(alice).forge(2, minAmt)).to.be.revertedWith("ALLOW");
  });

  it("forge() reverts if xntdAmount < MIN", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    // get some XNTD to alice by redeeming
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1
    const d1 = await core.nftData(1);
    await core.connect(alice).redeem(1);

    // mint base ordinary L1 (id=2)
    await core.connect(alice).mintWithXEN();

    const minAmt = await forge.minForgeAmount();
    const tooSmall = minAmt - 1n;

    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);
    await expect(forge.connect(alice).forge(2, tooSmall)).to.be.revertedWith("MIN");

    // baseId should still exist (no burn happened because reverted before burnL1ForForge)
    expect(await core.ownerOf(2)).to.equal(alice.address);
  });

  it("forge() reverts if baseId is not owned (Core should revert 'OF')", async function () {
    const { alice, bob, xen, core, xntd, forge } = await deploy();

    // get some XNTD to alice by redeeming
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1
    await core.connect(alice).redeem(1);

    // bob mints ordinary base L1 id=2 (fresh supply for bob)
    await xen.faucet(bob.address, ethers.parseEther("1000"));
    await core.connect(bob).mintWithXEN(); // id=2 owned by bob

    const minAmt = await forge.minForgeAmount();
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    // alice tries to forge using bob's baseId
    await expect(forge.connect(alice).forge(2, minAmt)).to.be.revertedWith("OF");
  });

  it("forge() reverts if baseId is forged (Core should revert 'F1')", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    // Mint XNTD to alice by redeeming first NFT
    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await core.connect(alice).mintWithXEN(); // id=1
    const d1 = await core.nftData(1);
    await core.connect(alice).redeem(1);

    // Mint ordinary base L1 id=2 (to be burned for first forge)
    await core.connect(alice).mintWithXEN();

    const minAmt = await forge.minForgeAmount();
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    // First forge succeeds -> forgedId
    const tx = await forge.connect(alice).forge(2, minAmt);
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

    // Now try to use forgedId as baseId (should revert 'F1' because Core requires !snap.isForged)
    // Need more XNTD to pass ALLOW/MIN: approve again
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    await expect(forge.connect(alice).forge(forgedId, minAmt)).to.be.revertedWith("F1");
  });

  it("forge() reverts if baseId is not L1 (Core should revert 'L1')", async function () {
    const { alice, xen, core, xntd, forge } = await deploy();

    // Get enough XNTD
    await xen.faucet(alice.address, ethers.parseEther("2000"));
    await core.connect(alice).mintWithXEN(); // id=1
    await core.connect(alice).redeem(1);

    // Mint two ordinary L1: id=2 and id=3, enchant them -> id=4 (level 2 ordinary)
    await core.connect(alice).mintWithXEN(); // id=2
    await core.connect(alice).mintWithXEN(); // id=3
    await core.connect(alice).enchant(2, 3); // new id=4, level 2 ordinary

    const d4 = await core.nftData(4);
    expect(d4.level).to.equal(2);
    expect(d4.isForged).to.equal(false);

    const minAmt = await forge.minForgeAmount();
    await xntd.connect(alice).approve(await forge.getAddress(), minAmt);

    // Try forging with level 2 base
    await expect(forge.connect(alice).forge(4, minAmt)).to.be.revertedWith("L1");
  });
});
