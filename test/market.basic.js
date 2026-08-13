// test/market.basic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ETHEREUM_PROTOCOL_PROFILE: P } = require("../scripts/lib/protocol-profiles");

describe("XenchantedMarket - basic tests", function () {
  async function deploy() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");

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
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    const Market = await ethers.getContractFactory("XenchantedMarket");
    const market = await Market.deploy(await core.getAddress());

    return {
      deployer,
      alice,
      bob,
      carol,
      xen,
      core,
      xntd,
      stake,
      forge,
      market,
      initialNominal,
      initialXenBurn,
    };
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

  async function listOne(env, who = env.alice, priceWei = ethers.parseEther("0.25")) {
    const { core, market } = env;

    const tokenId = await mintL1(env, who);

    await core.connect(who).approve(await market.getAddress(), tokenId);
    const tx = await market.connect(who).list(tokenId, priceWei);
    const rc = await tx.wait();

    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Listed");

    return {
      tokenId,
      listingId: log.args.listingId,
      priceWei,
    };
  }

  it("constructor stores CORE address", async function () {
    const { core, market } = await deploy();

    expect(await market.CORE()).to.equal(await core.getAddress());
    expect(await market.nextListingId()).to.equal(1n);
    expect(await market.activeListingCount()).to.equal(0n);
  });

  it("constructor rejects zero CORE address", async function () {
    const Market = await ethers.getContractFactory("XenchantedMarket");

    await expect(
      Market.deploy(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(Market, "ZeroAddress");
  });

  it("constructor rejects non-contract CORE address", async function () {
    const [, alice] = await ethers.getSigners();
    const Market = await ethers.getContractFactory("XenchantedMarket");

    await expect(
      Market.deploy(alice.address)
    ).to.be.revertedWithCustomError(Market, "NotContract");
  });

  it("list() transfers Core NFT to market escrow and creates active listing", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const tokenId = await mintL1(env, alice);
    const priceWei = ethers.parseEther("0.25");

    await core.connect(alice).approve(await market.getAddress(), tokenId);

    await expect(
      market.connect(alice).list(tokenId, priceWei)
    )
      .to.emit(market, "Listed")
      .withArgs(1n, alice.address, tokenId, priceWei);

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());
    expect(await market.activeListingCount()).to.equal(1n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(1n);

    const listing = await market.getListing(1);
    expect(listing.listingId).to.equal(1n);
    expect(listing.seller).to.equal(alice.address);
    expect(listing.tokenId).to.equal(tokenId);
    expect(listing.priceWei).to.equal(priceWei);
    expect(listing.active).to.equal(true);

    const byToken = await market.getListingByTokenId(tokenId);
    expect(byToken.listingId).to.equal(1n);
    expect(byToken.active).to.equal(true);
  });

  it("list() reverts if price is zero", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const tokenId = await mintL1(env, alice);
    await core.connect(alice).approve(await market.getAddress(), tokenId);

    await expect(
      market.connect(alice).list(tokenId, 0)
    ).to.be.revertedWithCustomError(market, "ZeroPrice");
  });

  it("list() reverts if caller is not token owner", async function () {
    const env = await deploy();
    const { alice, bob, core, market } = env;

    const tokenId = await mintL1(env, alice);
    await core.connect(alice).approve(await market.getAddress(), tokenId);

    await expect(
      market.connect(bob).list(tokenId, ethers.parseEther("0.25"))
    ).to.be.revertedWithCustomError(market, "NotOwner");
  });

  it("list() reverts if token is already listed", async function () {
    const env = await deploy();
    const { alice, market } = env;

    const { tokenId } = await listOne(env, alice);

    await expect(
      market.connect(alice).list(tokenId, ethers.parseEther("0.3"))
    ).to.be.revertedWithCustomError(market, "AlreadyListed");
  });

  it("cancel() returns NFT to seller and removes listing from active index", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const { tokenId, listingId } = await listOne(env, alice);

    await expect(
      market.connect(alice).cancel(listingId)
    )
      .to.emit(market, "Cancelled")
      .withArgs(listingId, alice.address, tokenId);

    expect(await core.ownerOf(tokenId)).to.equal(alice.address);
    expect(await market.activeListingCount()).to.equal(0n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(0n);

    const listing = await market.getListing(listingId);
    expect(listing.active).to.equal(false);
  });

  it("cancel() reverts if caller is not seller", async function () {
    const env = await deploy();
    const { bob, market } = env;

    const { listingId } = await listOne(env);

    await expect(
      market.connect(bob).cancel(listingId)
    ).to.be.revertedWithCustomError(market, "NotSeller");
  });

  it("buy() transfers NFT to buyer and records seller proceeds", async function () {
    const env = await deploy();
    const { alice, bob, core, market } = env;

    const { tokenId, listingId, priceWei } = await listOne(env, alice);

    await expect(
      market.connect(bob).buy(listingId, { value: priceWei })
    )
      .to.emit(market, "Sold")
      .withArgs(listingId, alice.address, bob.address, tokenId, priceWei);

    expect(await core.ownerOf(tokenId)).to.equal(bob.address);
    expect(await market.proceeds(alice.address)).to.equal(priceWei);
    expect(await market.totalProceeds()).to.equal(priceWei);
    expect(await market.activeListingCount()).to.equal(0n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(0n);

    const listing = await market.getListing(listingId);
    expect(listing.active).to.equal(false);
  });

  it("buy() reverts on wrong ETH amount", async function () {
    const env = await deploy();
    const { bob, market } = env;

    const { listingId } = await listOne(env);

    await expect(
      market.connect(bob).buy(listingId, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(market, "WrongValue");
  });

  it("buy() reverts on overpayment", async function () {
    const env = await deploy();
    const { bob, market } = env;

    const { listingId } = await listOne(env);

    await expect(
      market.connect(bob).buy(listingId, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(market, "WrongValue");
  });

  it("buy() reverts on self-buy", async function () {
    const env = await deploy();
    const { alice, market } = env;

    const { listingId, priceWei } = await listOne(env, alice);

    await expect(
      market.connect(alice).buy(listingId, { value: priceWei })
    ).to.be.revertedWithCustomError(market, "SelfBuy");
  });

  it("withdrawProceeds() clears proceeds and emits withdrawal event", async function () {
    const env = await deploy();
    const { alice, bob, market } = env;

    const { listingId, priceWei } = await listOne(env, alice);

    await market.connect(bob).buy(listingId, { value: priceWei });

    expect(await market.proceeds(alice.address)).to.equal(priceWei);
    expect(await market.totalProceeds()).to.equal(priceWei);

    await expect(
      market.connect(alice).withdrawProceeds()
    )
      .to.emit(market, "ProceedsWithdrawn")
      .withArgs(alice.address, priceWei);

    expect(await market.proceeds(alice.address)).to.equal(0n);
    expect(await market.totalProceeds()).to.equal(0n);
  });

  it("withdrawProceedsFor() lets a third party withdraw proceeds to seller", async function () {
    const env = await deploy();
    const { alice, bob, carol, market } = env;

    const { listingId, priceWei } = await listOne(env, alice);

    await market.connect(bob).buy(listingId, { value: priceWei });

    const sellerBefore = await ethers.provider.getBalance(alice.address);
    const callerBefore = await ethers.provider.getBalance(carol.address);

    await expect(
      market.connect(carol).withdrawProceedsFor(alice.address)
    )
      .to.emit(market, "ProceedsWithdrawn")
      .withArgs(alice.address, priceWei);

    const sellerAfter = await ethers.provider.getBalance(alice.address);
    const callerAfter = await ethers.provider.getBalance(carol.address);

    expect(sellerAfter - sellerBefore).to.equal(priceWei);
    expect(callerAfter).to.be.lessThan(callerBefore);

    expect(await market.proceeds(alice.address)).to.equal(0n);
    expect(await market.totalProceeds()).to.equal(0n);
  });

  it("withdrawProceedsFor() reverts if seller has no funds", async function () {
    const env = await deploy();
    const { alice, bob, market } = env;

    await expect(
      market.connect(bob).withdrawProceedsFor(alice.address)
    ).to.be.revertedWithCustomError(market, "NoFunds");
  });

  it("withdrawProceeds() reverts if seller has no funds", async function () {
    const env = await deploy();
    const { alice, market } = env;

    await expect(
      market.connect(alice).withdrawProceeds()
    ).to.be.revertedWithCustomError(market, "NoFunds");
  });

  it("direct safeTransferFrom to market is rejected", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const tokenId = await mintL1(env, alice);

    await expect(
      core
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](
          alice.address,
          await market.getAddress(),
          tokenId
        )
    ).to.be.revertedWithCustomError(market, "DirectTransferRejected");

    expect(await core.ownerOf(tokenId)).to.equal(alice.address);
  });

  it("active listing pagination works", async function () {
    const env = await deploy();
    const { alice, bob, market } = env;

    const first = await listOne(env, alice, ethers.parseEther("0.1"));
    const second = await listOne(env, bob, ethers.parseEther("0.2"));
    const third = await listOne(env, alice, ethers.parseEther("0.3"));

    expect(await market.activeListingCount()).to.equal(3n);

    const ids = await market.getActiveListingIds(0, 2);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(first.listingId);
    expect(ids[1]).to.equal(second.listingId);

    const listings = await market.getActiveListings(1, 2);
    expect(listings.length).to.equal(2);
    expect(listings[0].listingId).to.equal(second.listingId);
    expect(listings[0].priceWei).to.equal(ethers.parseEther("0.2"));
    expect(listings[1].listingId).to.equal(third.listingId);
    expect(listings[1].priceWei).to.equal(ethers.parseEther("0.3"));
  });

  it("active listing pagination rejects limit above MAX_PAGE_SIZE", async function () {
    const env = await deploy();
    const { market } = env;

    await expect(
      market.getActiveListingIds(0, 101)
    ).to.be.revertedWithCustomError(market, "BadPageSize");

    await expect(
      market.getActiveListings(0, 101)
    ).to.be.revertedWithCustomError(market, "BadPageSize");
  });

  it("removed listings do not break active listing index", async function () {
    const env = await deploy();
    const { alice, bob, market } = env;

    const first = await listOne(env, alice, ethers.parseEther("0.1"));
    const second = await listOne(env, bob, ethers.parseEther("0.2"));
    const third = await listOne(env, alice, ethers.parseEther("0.3"));

    await market.connect(bob).cancel(second.listingId);

    expect(await market.activeListingCount()).to.equal(2n);

    const ids = await market.getActiveListingIds(0, 10);
    expect(ids.length).to.equal(2);
    expect(ids).to.include(first.listingId);
    expect(ids).to.include(third.listingId);
    expect(ids).to.not.include(second.listingId);

    const inactive = await market.getListing(second.listingId);
    expect(inactive.active).to.equal(false);
  });
});
