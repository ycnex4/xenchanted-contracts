const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const XEN_MAINNET = "0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8";

describe("Mainnet fork - real XEN integration", function () {
  before(async function () {
    if (!process.env.MAINNET_RPC_URL) {
      throw new Error("MAINNET_RPC_URL is not set in .env");
    }

    if (!process.env.XEN_WHALE) {
      throw new Error("XEN_WHALE is not set in .env");
    }

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_RPC_URL,
          },
        },
      ],
    });
  });

  it("real XEN exposes expected metadata and decimals", async function () {
    const xen = await ethers.getContractAt(
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      XEN_MAINNET
    );

    expect(await xen.symbol()).to.equal("XEN");
    expect(await xen.decimals()).to.equal(18);
  });

  it("Core.mintWithXEN works against the real XEN burn flow", async function () {
    const [deployer, user] = await ethers.getSigners();

    const xenWhale = process.env.XEN_WHALE;
    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("100000000");

    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const XNTD = await ethers.getContractFactory("XNTDToken");
    const CoreTokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");

    const core = await Core.deploy(XEN_MAINNET, initialNominal, initialXenBurn);
    await core.waitForDeployment();

    const xntd = await XNTD.deploy(await core.getAddress());
    await xntd.waitForDeployment();

    const stake = await Stake.deploy(await core.getAddress());
    await stake.waitForDeployment();

    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());
    await forge.waitForDeployment();

    const coreLens = await CoreTokenURILens.deploy(await core.getAddress());
    await coreLens.waitForDeployment();

    const stakeLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeLens.waitForDeployment();

    await core.setTokenURILens(await coreLens.getAddress());
    await stake.setTokenURILens(await stakeLens.getAddress());
    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    const xen = await ethers.getContractAt(
      [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ],
      XEN_MAINNET
    );

    const xenAmount = await core.currentXenBurnAmount();
    const whaleBalance = await xen.balanceOf(xenWhale);

    expect(
      whaleBalance,
      "XEN_WHALE does not have enough XEN for this fork test"
    ).to.be.gte(xenAmount);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [xenWhale],
    });

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [
        xenWhale,
        "0x3635C9ADC5DEA00000", // 1000 ETH locally in the fork
      ],
    });

    const whaleSigner = await ethers.getSigner(xenWhale);

    await xen.connect(whaleSigner).transfer(user.address, xenAmount);

    expect(await xen.balanceOf(user.address)).to.be.gte(xenAmount);

    await xen.connect(user).approve(await core.getAddress(), xenAmount);

    expect(
      await xen.allowance(user.address, await core.getAddress())
    ).to.be.gte(xenAmount);

    await expect(core.connect(user).mintWithXEN()).to.not.be.reverted;

    expect(await core.balanceOf(user.address)).to.equal(1n);

    const data = await core.nftData(1);

    expect(data.level).to.equal(1);
    expect(data.isForged).to.equal(false);
    expect(data.nominal).to.equal(initialNominal);
    expect(data.xenBurned).to.equal(xenAmount);
    expect(data.xntdBurned).to.equal(0n);

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [xenWhale],
    });
  });
});
