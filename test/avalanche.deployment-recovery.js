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

describe("Avalanche partial deployment recovery", function () {
  it("finishes wiring from recorded addresses after interruption before Core.init", async function () {
    const [deployer] = await ethers.getSigners();
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
    await core.waitForDeployment();
    const coreAddress = await core.getAddress();

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(coreAddress);
    await xntd.waitForDeployment();
    const xntdAddress = await xntd.getAddress();

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(
      ...stakeConstructorArgs(coreAddress, AVALANCHE_PROTOCOL_PROFILE)
    );
    await stake.waitForDeployment();
    const stakeAddress = await stake.getAddress();

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(coreAddress, xntdAddress);
    await forge.waitForDeployment();
    const forgeAddress = await forge.getAddress();

    const Market = await ethers.getContractFactory("XenchantedMarket");
    const market = await Market.deploy(coreAddress);
    await market.waitForDeployment();
    const marketAddress = await market.getAddress();

    const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
    const nftLens = await NFTLens.deploy(coreAddress, stakeAddress);
    await nftLens.waitForDeployment();
    const nftLensAddress = await nftLens.getAddress();

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(coreAddress);
    await tokenUriLens.waitForDeployment();
    const tokenUriLensAddress = await tokenUriLens.getAddress();

    const StakeTokenURILens = await ethers.getContractFactory(
      "xEnchantedStakeTokenURILens"
    );
    const stakeTokenUriLens = await StakeTokenURILens.deploy(stakeAddress);
    await stakeTokenUriLens.waitForDeployment();
    const stakeTokenUriLensAddress = await stakeTokenUriLens.getAddress();

    await (await core.setTokenURILens(tokenUriLensAddress)).wait();
    await (await stake.setTokenURILens(stakeTokenUriLensAddress)).wait();

    // Simulated interruption: all eight addresses and both lens transactions
    // are recorded, Stake rights are already burned, but Core.init was not sent.
    const recorded = {
      core: coreAddress,
      xntd: xntdAddress,
      stake: stakeAddress,
      forge: forgeAddress,
      market: marketAddress,
      nftLens: nftLensAddress,
      tokenUriLens: tokenUriLensAddress,
      stakeTokenUriLens: stakeTokenUriLensAddress,
    };

    for (const address of Object.values(recorded)) {
      expect(await ethers.provider.getCode(address)).to.not.equal("0x");
    }

    // Reconnect only from the recorded public addresses, as the runbook requires.
    const recoveredCore = await ethers.getContractAt("xEnchantedNFT", recorded.core);
    const recoveredXntd = await ethers.getContractAt("XNTDToken", recorded.xntd);
    const recoveredStake = await ethers.getContractAt(
      "xEnchantedStake",
      recorded.stake
    );
    const recoveredForge = await ethers.getContractAt(
      "xEnchantedForge",
      recorded.forge
    );
    const recoveredMarket = await ethers.getContractAt(
      "XenchantedMarket",
      recorded.market
    );
    const recoveredNftLens = await ethers.getContractAt(
      "xEnchantedNFTLens",
      recorded.nftLens
    );
    const recoveredTokenUriLens = await ethers.getContractAt(
      "xEnchantedTokenURILens",
      recorded.tokenUriLens
    );
    const recoveredStakeTokenUriLens = await ethers.getContractAt(
      "xEnchantedStakeTokenURILens",
      recorded.stakeTokenUriLens
    );

    // Mandatory pre-recovery handshake.
    expect(await recoveredCore.XEN()).to.equal(AXEN_MAINNET);
    expect(await recoveredCore.INITIAL_NOMINAL()).to.equal(initialNominal);
    expect(await recoveredCore.INITIAL_XEN_BURN()).to.equal(initialXenBurn);
    expect(await recoveredCore.HALVING_INTERVAL()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds)
    );
    expect(await recoveredCore.XEN_BURN_HALVING_INTERVAL()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds)
    );
    expect(await recoveredCore.TOKEN_URI_LENS()).to.equal(recorded.tokenUriLens);
    expect(await recoveredCore.DEPLOYER()).to.equal(deployer.address);
    expect(await recoveredCore.initialized()).to.equal(false);

    expect(await recoveredXntd.CORE()).to.equal(recorded.core);
    expect(await recoveredXntd.forgeBound()).to.equal(false);
    expect(await recoveredStake.CORE()).to.equal(recorded.core);
    expect(await recoveredStake.TOKEN_URI_LENS()).to.equal(
      recorded.stakeTokenUriLens
    );
    expect(await recoveredStake.DEPLOYER()).to.equal(ethers.ZeroAddress);
    expect(await recoveredStake.MIN_DAYS()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.minStakeDays)
    );
    expect(await recoveredStake.MAX_DAYS()).to.equal(
      BigInt(AVALANCHE_PROTOCOL_PROFILE.maxStakeDays)
    );
    expect(await recoveredForge.CORE()).to.equal(recorded.core);
    expect(await recoveredForge.XNTD()).to.equal(recorded.xntd);
    expect(await recoveredMarket.CORE()).to.equal(recorded.core);
    expect(await recoveredNftLens.CORE()).to.equal(recorded.core);
    expect(await recoveredNftLens.STAKE()).to.equal(recorded.stake);
    expect(await recoveredTokenUriLens.CORE()).to.equal(recorded.core);
    expect(await recoveredStakeTokenUriLens.STAKE()).to.equal(recorded.stake);

    // The only remaining state-changing recovery step.
    await (
      await recoveredCore.init(recorded.xntd, recorded.stake, recorded.forge)
    ).wait();

    expect(await recoveredCore.XNTD()).to.equal(recorded.xntd);
    expect(await recoveredCore.STAKING()).to.equal(recorded.stake);
    expect(await recoveredCore.FORGE()).to.equal(recorded.forge);
    expect(await recoveredCore.DEPLOYER()).to.equal(ethers.ZeroAddress);
    expect(await recoveredCore.initialized()).to.equal(true);
    expect(await recoveredXntd.FORGE()).to.equal(recorded.forge);
    expect(await recoveredXntd.forgeBound()).to.equal(true);

    await expect(
      recoveredCore.init(recorded.xntd, recorded.stake, recorded.forge)
    ).to.be.revertedWith("DEP");
  });
});
