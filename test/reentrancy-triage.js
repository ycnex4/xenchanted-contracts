const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reentrancy triage for intentional CEI deviations", function () {
  async function deployCoreWithXen(xenFactoryName = "MockXEN") {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Xen = await ethers.getContractFactory(xenFactoryName);
    const xen = await Xen.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(
      await xen.getAddress(),
      initialNominal,
      initialXenBurn,
    );

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(
      await core.getAddress(),
      await xntd.getAddress(),
    );

    const TokenURILens = await ethers.getContractFactory(
      "xEnchantedTokenURILens",
    );
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory(
      "xEnchantedStakeTokenURILens",
    );
    const stakeTokenUriLens = await StakeTokenURILens.deploy(
      await stake.getAddress(),
    );
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(
      await xntd.getAddress(),
      await stake.getAddress(),
      await forge.getAddress(),
    );

    return {
      deployer,
      alice,
      bob,
      xen,
      core,
      xntd,
      stake,
      forge,
      initialNominal,
      initialXenBurn,
    };
  }

  it("mintWithXEN blocks reentry attempted during XEN burn", async function () {
    const env = await deployCoreWithXen("ReentrantXEN");
    const { alice, xen, core, initialXenBurn } = env;

    await xen.faucet(alice.address, ethers.parseEther("1000"));
    await xen
      .connect(alice)
      .approve(await core.getAddress(), await core.currentXenBurnAmount());

    await expect(core.connect(alice).mintWithXEN()).to.emit(core, "Minted");

    expect(await xen.reentryAttempted()).to.equal(true);
    expect(await xen.reentryBlocked()).to.equal(true);
    expect(await xen.reentrySucceeded()).to.equal(false);

    expect(await xen.lastBurnCaller()).to.equal(await core.getAddress());
    expect(await xen.lastBurnUser()).to.equal(alice.address);
    expect(await xen.lastBurnAmount()).to.equal(initialXenBurn);

    expect(await core.balanceOf(alice.address)).to.equal(1n);
  });

  it("stake blocks reentry attempted during Core burnForStaking", async function () {
    const [deployer, alice] = await ethers.getSigners();

    const ReentrantStakeCore = await ethers.getContractFactory(
      "ReentrantStakeCore",
    );
    const core = await ReentrantStakeCore.deploy();

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    await core.setStakeTarget(await stake.getAddress());
    await core.setReentryTokenId(2);

    await expect(stake.connect(alice).stake(1, 30)).to.emit(stake, "Staked");

    expect(await core.reentryAttempted()).to.equal(true);
    expect(await core.reentryBlocked()).to.equal(true);
    expect(await core.reentrySucceeded()).to.equal(false);

    expect(await stake.ownerOf(1)).to.equal(alice.address);

    const pos = await stake.pos(1);
    const snap = pos[0];

    expect(pos[4]).to.equal(true);
    expect(snap[0]).to.equal(2);
    expect(snap[4]).to.equal(ethers.parseEther("300"));
  });

  it("market.list blocks reentry attempted during escrow safeTransferFrom", async function () {
    const [deployer, alice] = await ethers.getSigners();

    const ReentrantMarketCore = await ethers.getContractFactory(
      "ReentrantMarketCore",
    );
    const core = await ReentrantMarketCore.deploy();

    const Market = await ethers.getContractFactory("XenchantedMarket");
    const market = await Market.deploy(await core.getAddress());

    const tokenId = await core.mint.staticCall(alice.address);
    await core.mint(alice.address);

    const reentryTokenId = await core.mint.staticCall(await core.getAddress());
    await core.mint(await core.getAddress());

    await core.setMarketTarget(await market.getAddress());
    await core.setReentryTokenId(reentryTokenId);
    await core.setReentryPriceWei(ethers.parseEther("0.5"));

    await core.connect(alice).approve(await market.getAddress(), tokenId);

    const priceWei = ethers.parseEther("0.25");

    await expect(market.connect(alice).list(tokenId, priceWei)).to.emit(
      market,
      "Listed",
    );

    expect(await core.reentryAttempted()).to.equal(true);
    expect(await core.reentryBlocked()).to.equal(true);
    expect(await core.reentrySucceeded()).to.equal(false);

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());
    expect(await market.activeListingCount()).to.equal(1n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(1n);

    const listing = await market.getListing(1);
    expect(listing.seller).to.equal(alice.address);
    expect(listing.tokenId).to.equal(tokenId);
    expect(listing.priceWei).to.equal(priceWei);
    expect(listing.active).to.equal(true);
  });
});