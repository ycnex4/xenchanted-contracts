// test/market.reverts.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("XenchantedMarket - reverts and edge cases", function () {
  async function deploy() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

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

    const Market = await ethers.getContractFactory("XenchantedMarket");
    const market = await Market.deploy(await core.getAddress());

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const mockNft = await MockERC721.deploy();

    const RejectingERC721Receiver = await ethers.getContractFactory("RejectingERC721Receiver");
    const rejectingReceiver = await RejectingERC721Receiver.deploy();

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
      mockNft,
      rejectingReceiver,
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

  async function enchant(env, id1, id2, who = env.alice) {
    const tx = await env.core.connect(who).enchant(id1, id2);
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");

    return log.args.id;
  }

  async function mintL2(env, who = env.alice) {
    const id1 = await mintL1(env, who);
    const id2 = await mintL1(env, who);

    return enchant(env, id1, id2, who);
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

  it("non-Core safeTransferFrom to market is rejected", async function () {
    const env = await deploy();
    const { alice, market, mockNft } = env;

    const tx = await mockNft.mint(alice.address);
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Transfer");
    const tokenId = log.args.tokenId;

    await expect(
      mockNft
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](
          alice.address,
          await market.getAddress(),
          tokenId
        )
    ).to.be.revertedWithCustomError(market, "UnsupportedCollection");

    expect(await mockNft.ownerOf(tokenId)).to.equal(alice.address);
  });

  it("buy() reverts on inactive listing", async function () {
    const env = await deploy();
    const { bob, market } = env;

    await expect(
      market.connect(bob).buy(777, { value: ethers.parseEther("0.25") })
    ).to.be.revertedWithCustomError(market, "NotActive");
  });

  it("cancel() reverts on inactive listing", async function () {
    const env = await deploy();
    const { alice, market } = env;

    await expect(
      market.connect(alice).cancel(777)
    ).to.be.revertedWithCustomError(market, "NotActive");
  });

  it("buy() after cancel reverts and NFT stays with seller", async function () {
    const env = await deploy();
    const { alice, bob, core, market } = env;

    const { tokenId, listingId, priceWei } = await listOne(env, alice);

    await market.connect(alice).cancel(listingId);

    await expect(
      market.connect(bob).buy(listingId, { value: priceWei })
    ).to.be.revertedWithCustomError(market, "NotActive");

    expect(await core.ownerOf(tokenId)).to.equal(alice.address);
    expect(await market.proceeds(alice.address)).to.equal(0n);
  });

  it("cancel() after buy reverts and NFT stays with buyer", async function () {
    const env = await deploy();
    const { alice, bob, core, market } = env;

    const { tokenId, listingId, priceWei } = await listOne(env, alice);

    await market.connect(bob).buy(listingId, { value: priceWei });

    await expect(
      market.connect(alice).cancel(listingId)
    ).to.be.revertedWithCustomError(market, "NotActive");

    expect(await core.ownerOf(tokenId)).to.equal(bob.address);
    expect(await market.proceeds(alice.address)).to.equal(priceWei);
  });

  it("buyer contract rejecting ERC721 makes buy revert and listing remains active", async function () {
    const env = await deploy();
    const { alice, core, market, rejectingReceiver } = env;

    const { tokenId, listingId, priceWei } = await listOne(env, alice);

    await expect(
      rejectingReceiver.buy(await market.getAddress(), listingId, { value: priceWei })
    ).to.be.revertedWithCustomError(rejectingReceiver, "ERC721Rejected");

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());
    expect(await market.activeListingCount()).to.equal(1n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(listingId);

    const listing = await market.getListing(listingId);
    expect(listing.active).to.equal(true);
    expect(await market.proceeds(alice.address)).to.equal(0n);
    expect(await market.totalProceeds()).to.equal(0n);
  });

  it("failed withdraw restores proceeds because tx reverts", async function () {
    const env = await deploy();
    const { alice, bob, core, market, rejectingReceiver } = env;

    const priceWei = ethers.parseEther("0.25");
    const tokenId = await mintL1(env, alice);

    await core
      .connect(alice)
      ["transferFrom(address,address,uint256)"](
        alice.address,
        await rejectingReceiver.getAddress(),
        tokenId
      );

    expect(await core.ownerOf(tokenId)).to.equal(await rejectingReceiver.getAddress());

    await rejectingReceiver.approveAndList(
      await core.getAddress(),
      await market.getAddress(),
      tokenId,
      priceWei
    );

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());

    const listingId = await market.activeListingIdByTokenId(tokenId);
    await market.connect(bob).buy(listingId, { value: priceWei });

    expect(await core.ownerOf(tokenId)).to.equal(bob.address);
    expect(await market.proceeds(await rejectingReceiver.getAddress())).to.equal(priceWei);
    expect(await market.totalProceeds()).to.equal(priceWei);

    await expect(
        rejectingReceiver.withdrawFromMarket(await market.getAddress())
    ).to.be.revertedWithCustomError(market, "WithdrawFailed");

    expect(await market.proceeds(await rejectingReceiver.getAddress())).to.equal(priceWei);
    expect(await market.totalProceeds()).to.equal(priceWei);
  });

  it("direct ETH transfer to market receive() is rejected", async function () {
    const env = await deploy();
    const { alice, market } = env;

    await expect(
      alice.sendTransaction({
        to: await market.getAddress(),
        value: ethers.parseEther("0.01"),
      })
    ).to.be.revertedWithCustomError(market, "DirectTransferRejected");
  });

  it("unknown calldata with ETH to market fallback() is rejected", async function () {
    const env = await deploy();
    const { alice, market } = env;

    await expect(
      alice.sendTransaction({
        to: await market.getAddress(),
        value: ethers.parseEther("0.01"),
        data: "0x12345678",
      })
    ).to.be.revertedWithCustomError(market, "DirectTransferRejected");
  });

  it("unsafe transferFrom bypasses receiver and is documented as technical user error", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const tokenId = await mintL1(env, alice);

    await core
      .connect(alice)
      ["transferFrom(address,address,uint256)"](
        alice.address,
        await market.getAddress(),
        tokenId
      );

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());
    expect(await market.activeListingCount()).to.equal(0n);
    expect(await market.activeListingIdByTokenId(tokenId)).to.equal(0n);

    const byToken = await market.getListingByTokenId(tokenId);
    expect(byToken.active).to.equal(false);
    expect(byToken.listingId).to.equal(0n);
  });

  it("listed NFT cannot be redeemed by seller because seller no longer owns it", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const { tokenId } = await listOne(env, alice);

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());

    await expect(
      core.connect(alice).redeem(tokenId)
    ).to.be.reverted;
  });

  it("listed NFT cannot be staked by seller because seller no longer owns it", async function () {
    const env = await deploy();
    const { alice, core, stake, market } = env;

    const tokenId = await mintL2(env, alice);
    const priceWei = ethers.parseEther("0.25");

    await core.connect(alice).approve(await market.getAddress(), tokenId);
    await market.connect(alice).list(tokenId, priceWei);

    expect(await core.ownerOf(tokenId)).to.equal(await market.getAddress());

    await expect(
      stake.connect(alice).stake(tokenId, 30)
    ).to.be.reverted;
  });

  it("listed NFT cannot be enchanted by seller because seller no longer owns it", async function () {
    const env = await deploy();
    const { alice, core, market } = env;

    const listedTokenId = await mintL1(env, alice);
    const otherTokenId = await mintL1(env, alice);

    await core.connect(alice).approve(await market.getAddress(), listedTokenId);
    await market.connect(alice).list(listedTokenId, ethers.parseEther("0.25"));

    expect(await core.ownerOf(listedTokenId)).to.equal(await market.getAddress());

    await expect(
      core.connect(alice).enchant(listedTokenId, otherTokenId)
    ).to.be.reverted;
  });
});