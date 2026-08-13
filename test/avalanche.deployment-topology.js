const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
  AXEN_MAINNET,
  INITIAL_NOMINAL_TEXT,
  INITIAL_XEN_BURN_TEXT,
  AVALANCHE_PROTOCOL_PROFILE,
} = require("../scripts/lib/avalanche-mainnet");
const {
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("../scripts/lib/protocol-profiles");

describe("Avalanche deployment topology", function () {
  it("deploys and irreversibly wires the exact eight-contract profile", async function () {
    const initialNominal = ethers.parseEther(INITIAL_NOMINAL_TEXT);
    const initialXenBurn = ethers.parseEther(INITIAL_XEN_BURN_TEXT);

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(
      ...coreConstructorArgs(
        AXEN_MAINNET,
        initialNominal,
        initialXenBurn,
        AVALANCHE_PROTOCOL_PROFILE
      )
    );
    const coreAddress = await core.getAddress();

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(coreAddress);
    const xntdAddress = await xntd.getAddress();

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(
      ...stakeConstructorArgs(coreAddress, AVALANCHE_PROTOCOL_PROFILE)
    );
    const stakeAddress = await stake.getAddress();

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(coreAddress, xntdAddress);
    const forgeAddress = await forge.getAddress();

    const Market = await ethers.getContractFactory("XenchantedMarket");
    const market = await Market.deploy(coreAddress);

    const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
    const nftLens = await NFTLens.deploy(coreAddress, stakeAddress);

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(coreAddress);

    const StakeTokenURILens = await ethers.getContractFactory(
      "xEnchantedStakeTokenURILens"
    );
    const stakeTokenUriLens = await StakeTokenURILens.deploy(stakeAddress);

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());
    await core.init(xntdAddress, stakeAddress, forgeAddress);

    expect(await core.XEN()).to.equal(AXEN_MAINNET);
    expect(await core.XNTD()).to.equal(xntdAddress);
    expect(await core.STAKING()).to.equal(stakeAddress);
    expect(await core.FORGE()).to.equal(forgeAddress);
    expect(await xntd.CORE()).to.equal(coreAddress);
    expect(await xntd.FORGE()).to.equal(forgeAddress);
    expect(await stake.CORE()).to.equal(coreAddress);
    expect(await forge.CORE()).to.equal(coreAddress);
    expect(await forge.XNTD()).to.equal(xntdAddress);
    expect(await market.CORE()).to.equal(coreAddress);
    expect(await nftLens.CORE()).to.equal(coreAddress);
    expect(await nftLens.STAKE()).to.equal(stakeAddress);
    expect(await core.DEPLOYER()).to.equal(ethers.ZeroAddress);
    expect(await stake.DEPLOYER()).to.equal(ethers.ZeroAddress);
    expect(await core.HALVING_INTERVAL()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds)
    );
    expect(await core.XEN_BURN_HALVING_INTERVAL()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds)
    );
    expect(await stake.MIN_DAYS()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.minStakeDays)
    );
    expect(await stake.MAX_DAYS()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.maxStakeDays)
    );
  });
});
