const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const {
  AXEN_MAINNET,
  AXEN_EXPECTED_NAME,
  AXEN_EXPECTED_SYMBOL,
  AXEN_EXPECTED_DECIMALS,
  INITIAL_NOMINAL_TEXT,
  INITIAL_XEN_BURN_TEXT,
  AVALANCHE_PROTOCOL_PROFILE,
} = require("../scripts/lib/avalanche-mainnet");
const {
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("../scripts/lib/protocol-profiles");

// Snapshot source: Snowtrace aXEN holders page, checked 2026-08-13.
// Override this with AVALANCHE_XEN_WHALE if the balance later moves.
const DEFAULT_AXEN_WHALE = "0xD6863a82F3FD18f5583f5001F5f35737fD40Cb2b";

describe("Avalanche mainnet fork - real aXEN integration", function () {
  before(async function () {
    if (!process.env.AVALANCHE_RPC_URL) {
      throw new Error("AVALANCHE_RPC_URL is not set in .env");
    }

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.AVALANCHE_RPC_URL,
          },
        },
      ],
    });

    // Hardhat EDR has no Avalanche hardfork activation history for executing
    // eth_call directly on the historical fork block. Mine one local block so
    // subsequent calls execute in the configured local Cancun environment while
    // preserving the forked Avalanche state.
    await network.provider.request({ method: "evm_mine", params: [] });
  });

  it("real aXEN exposes the expected code and metadata", async function () {
    expect(await ethers.provider.getCode(AXEN_MAINNET)).to.not.equal("0x");

    const axen = await ethers.getContractAt(
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      AXEN_MAINNET
    );

    expect(await axen.name()).to.equal(AXEN_EXPECTED_NAME);
    expect(await axen.symbol()).to.equal(AXEN_EXPECTED_SYMBOL);
    expect(await axen.decimals()).to.equal(AXEN_EXPECTED_DECIMALS);
  });

  it("Core.mintWithXEN works against the real aXEN burn callback", async function () {
    const [deployer, user] = await ethers.getSigners();
    const axenWhale = process.env.AVALANCHE_XEN_WHALE || DEFAULT_AXEN_WHALE;
    const initialNominal = ethers.parseEther(INITIAL_NOMINAL_TEXT);
    const initialXenBurn = ethers.parseEther(INITIAL_XEN_BURN_TEXT);

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const XNTD = await ethers.getContractFactory("XNTDToken");
    const CoreTokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");

    const core = await Core.deploy(
      ...coreConstructorArgs(
        AXEN_MAINNET,
        initialNominal,
        initialXenBurn,
        AVALANCHE_PROTOCOL_PROFILE
      )
    );
    await core.waitForDeployment();

    const xntd = await XNTD.deploy(await core.getAddress());
    await xntd.waitForDeployment();

    const stake = await Stake.deploy(
      ...stakeConstructorArgs(await core.getAddress(), AVALANCHE_PROTOCOL_PROFILE)
    );
    await stake.waitForDeployment();

    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());
    await forge.waitForDeployment();

    const coreLens = await CoreTokenURILens.deploy(await core.getAddress());
    await coreLens.waitForDeployment();

    const stakeLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeLens.waitForDeployment();

    await (await core.setTokenURILens(await coreLens.getAddress())).wait();
    await (await stake.setTokenURILens(await stakeLens.getAddress())).wait();
    await (
      await core.init(
        await xntd.getAddress(),
        await stake.getAddress(),
        await forge.getAddress()
      )
    ).wait();

    const axen = await ethers.getContractAt(
      [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
      ],
      AXEN_MAINNET
    );

    const xenAmount = await core.currentXenBurnAmount();
    const totalSupplyBeforeBurn = await axen.totalSupply();

    expect(await axen.balanceOf(axenWhale)).to.be.gte(
      xenAmount,
      "Configured aXEN whale does not have enough aXEN"
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [axenWhale],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [axenWhale, "0x3635C9ADC5DEA00000"],
    });

    const whaleSigner = await ethers.getSigner(axenWhale);
    await (await axen.connect(whaleSigner).transfer(user.address, xenAmount)).wait();
    await (await axen.connect(user).approve(await core.getAddress(), xenAmount)).wait();

    expect(await axen.balanceOf(user.address)).to.equal(xenAmount);
    expect(await axen.allowance(user.address, await core.getAddress())).to.be.gte(xenAmount);

    await expect(core.connect(user).mintWithXEN()).to.not.be.reverted;

    expect(await axen.balanceOf(user.address)).to.equal(0n);
    expect(await axen.totalSupply()).to.equal(totalSupplyBeforeBurn - xenAmount);
    expect(await axen.allowance(user.address, await core.getAddress())).to.equal(0n);
    expect(await core.balanceOf(user.address)).to.equal(1n);
    const data = await core.nftData(1);
    expect(data.level).to.equal(1);
    expect(data.isForged).to.equal(false);
    expect(data.nominal).to.equal(initialNominal);
    expect(data.xenBurned).to.equal(xenAmount);
    expect(data.xntdBurned).to.equal(0n);

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [axenWhale],
    });
  });
});
