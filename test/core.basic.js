const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("xEnchantedNFT Core - basic flow with XEN burn()", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();

    // 1) Deploy MockXEN
    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();
    await xen.waitForDeployment();

    // 2) Deploy Core
    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");
    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);
    await core.waitForDeployment();

    // 3) Deploy XNTDToken(core)
    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());
    await xntd.waitForDeployment();

    // 4) Deploy Stake(core)
    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());
    await stake.waitForDeployment();

    // 5) Deploy Forge(core, xntd)
    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());
    await forge.waitForDeployment();

    // 6) init Core
    await (await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress())).wait();

    return { deployer, alice, xen, core, xntd, stake, forge, initialNominal, initialXenBurn };
  }

  it("mintWithXEN burns XEN via burn() + callback, and mints L1 NFT", async function () {
    const { alice, xen, core, initialXenBurn } = await deploy();

    // give alice XEN
    await (await xen.faucet(alice.address, ethers.parseEther("1000"))).wait();
    const before = await xen.balanceOf(alice.address);

    // mint
    await (await core.connect(alice).mintWithXEN()).wait();

    // XEN burned
    const after = await xen.balanceOf(alice.address);
    expect(before - after).to.equal(initialXenBurn);

    // ensure MockXEN burn() saw Core as caller and made callback
    expect(await xen.lastBurnCaller()).to.equal(await core.getAddress());
    expect(await xen.lastBurnUser()).to.equal(alice.address);
    expect(await xen.lastBurnAmount()).to.equal(initialXenBurn);

    // NFT minted with id=1
    expect(await core.ownerOf(1)).to.equal(alice.address);

    // data checks
    const d = await core.nftData(1);
    expect(d.level).to.equal(1);
    expect(d.isForged).to.equal(false);
    expect(d.nominal).to.not.equal(0n);
    expect(d.xenBurned).to.equal(initialXenBurn);
  });

  it("EOA cannot call XEN.burn directly (must be IBurnRedeemable contract)", async function () {
    const { alice, xen } = await deploy();

    await (await xen.faucet(alice.address, ethers.parseEther("1000"))).wait();

    // EOA is not IERC165 => should revert
    await expect(
      xen.connect(alice).burn(alice.address, ethers.parseEther("10"))
    ).to.be.revertedWith("Burn: not a supported contract");
  });
  it("redeem burns NFT and mints XNTD = nominal", async function () {
  const { alice, xen, core, xntd } = await deploy();

  // give alice XEN and mint
  await xen.faucet(alice.address, ethers.parseEther("1000"));
  await core.connect(alice).mintWithXEN();

  // read nominal from Core storage (before redeem)
  const dBefore = await core.nftData(1);
  const nom = dBefore.nominal;

  const balBefore = await xntd.balanceOf(alice.address);

  // redeem
  await core.connect(alice).redeem(1);

  // XNTD minted
  const balAfter = await xntd.balanceOf(alice.address);
  expect(balAfter - balBefore).to.equal(nom);

  // NFT burned: ownerOf should revert
  await expect(core.ownerOf(1)).to.be.reverted;

  // nftData deleted => all fields default zero
  const dAfter = await core.nftData(1);
  expect(dAfter.level).to.equal(0);
  expect(dAfter.nominal).to.equal(0n);
});

it("redeem reverts if caller is not owner", async function () {
  const { deployer, alice, xen, core } = await deploy();

  await xen.faucet(alice.address, ethers.parseEther("1000"));
  await core.connect(alice).mintWithXEN();

  // deployer is not owner
  await expect(core.connect(deployer).redeem(1)).to.be.revertedWith("OWN");
});
it("enchant reverts on TYPE mismatch (no mixing)", async function () {
  const { alice, xen, core, xntd, forge } = await deploy();

  await xen.faucet(alice.address, ethers.parseEther("1000"));

  // ordinary L1 id=1 (will be used as baseId for forge)
  await core.connect(alice).mintWithXEN();

  // ordinary L1 id=2 -> redeem to get XNTD
  await core.connect(alice).mintWithXEN();
  const d2 = await core.nftData(2);
  await core.connect(alice).redeem(2); // alice gets XNTD = d2.nominal

// forge: burns baseId=1 + burns XNTD from alice -> mints forged NFT
await xntd.connect(alice).approve(await forge.getAddress(), d2.nominal);

// сначала staticCall, потом реальный forge
const forgedId = await forge.connect(alice).forge.staticCall(1, d2.nominal);
await forge.connect(alice).forge(1, d2.nominal);

  // Now we need an ordinary token to mix with forged.
  // Mint a new ordinary -> next id after forge should be forgedId+1, but we don't rely on that.
  await core.connect(alice).mintWithXEN(); // new ordinary (let's call it idOrd)

  // Find the latest minted id deterministically:
  // Since in this test ids are sequential: 1,2 minted; 2 redeemed (burned); forge mints 3; mintWithXEN mints 4
  // But to be safe, we can just use 4 directly:
  const idOrd = forgedId + 1n;

  // sanity: idOrd exists and is ordinary; forgedId exists and is forged
  expect(await core.ownerOf(forgedId)).to.equal(alice.address);
  expect(await core.ownerOf(idOrd)).to.equal(alice.address);

  const f = await core.nftData(forgedId);
  const o = await core.nftData(idOrd);
  expect(f.isForged).to.equal(true);
  expect(o.isForged).to.equal(false);

  // no mixing: should revert
  await expect(core.connect(alice).enchant(idOrd, forgedId)).to.be.revertedWith("TYPE");
});
});