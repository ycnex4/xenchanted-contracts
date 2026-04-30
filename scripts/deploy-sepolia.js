const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // -----------------------------
  // CONFIG
  // -----------------------------
  const INITIAL_NOMINAL = ethers.parseEther("100");
  const INITIAL_XEN_BURN = ethers.parseEther("10");

  // -----------------------------
  // 1) Deploy MockXEN
  // -----------------------------
  const MockXEN = await ethers.getContractFactory("MockXEN");
  const xen = await MockXEN.deploy();
  await xen.waitForDeployment();
  const xenAddr = await xen.getAddress();
  console.log("MockXEN deployed:", xenAddr);

  // -----------------------------
  // 2) Deploy Core
  // -----------------------------
  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const core = await Core.deploy(xenAddr, INITIAL_NOMINAL, INITIAL_XEN_BURN);
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("Core deployed:", coreAddr);

  // -----------------------------
  // 3) Deploy XNTD
  // -----------------------------
  const XNTD = await ethers.getContractFactory("XNTDToken");
  const xntd = await XNTD.deploy(coreAddr);
  await xntd.waitForDeployment();
  const xntdAddr = await xntd.getAddress();
  console.log("XNTD deployed:", xntdAddr);

  // -----------------------------
  // 4) Deploy Stake
  // -----------------------------
  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const stake = await Stake.deploy(coreAddr);
  await stake.waitForDeployment();
  const stakeAddr = await stake.getAddress();
  console.log("Stake deployed:", stakeAddr);

  // -----------------------------
  // 5) Deploy Forge
  // -----------------------------
  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const forge = await Forge.deploy(coreAddr, xntdAddr);
  await forge.waitForDeployment();
  const forgeAddr = await forge.getAddress();
  console.log("Forge deployed:", forgeAddr);

  // -----------------------------
  // 6) Deploy Lens contracts
  // -----------------------------
  const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
  const nftLens = await NFTLens.deploy(coreAddr);
  await nftLens.waitForDeployment();
  const nftLensAddr = await nftLens.getAddress();
  console.log("xEnchantedNFTLens deployed:", nftLensAddr);

  const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
  const tokenUriLens = await TokenURILens.deploy(coreAddr);
  await tokenUriLens.waitForDeployment();
  const tokenUriLensAddr = await tokenUriLens.getAddress();
  console.log("xEnchantedTokenURILens deployed:", tokenUriLensAddr);

  const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
  const stakeTokenUriLens = await StakeTokenURILens.deploy(stakeAddr);
  await stakeTokenUriLens.waitForDeployment();
  const stakeTokenUriLensAddr = await stakeTokenUriLens.getAddress();
  console.log("xEnchantedStakeTokenURILens deployed:", stakeTokenUriLensAddr);

  // -----------------------------
  // 7) Wire URI lens contracts
  // -----------------------------
  console.log("Setting Core tokenURI lens...");
  const txSetCoreUriLens = await core.setTokenURILens(tokenUriLensAddr);
  await txSetCoreUriLens.wait();
  console.log("Core tokenURI lens set");

  console.log("Setting Stake tokenURI lens...");
  const txSetStakeUriLens = await stake.setTokenURILens(stakeTokenUriLensAddr);
  await txSetStakeUriLens.wait();
  console.log("Stake tokenURI lens set");

  // -----------------------------
  // 8) Init Core
  // -----------------------------
  console.log("Initializing Core...");
  const txInit = await core.init(xntdAddr, stakeAddr, forgeAddr);
  await txInit.wait();
  console.log("Core initialized");

  // -----------------------------
  // DONE
  // -----------------------------
  console.log("\n=== DEPLOY COMPLETE ===");
  console.log("MockXEN:                       ", xenAddr);
  console.log("Core:                          ", coreAddr);
  console.log("XNTD:                          ", xntdAddr);
  console.log("Stake:                         ", stakeAddr);
  console.log("Forge:                         ", forgeAddr);
  console.log("xEnchantedNFTLens:             ", nftLensAddr);
  console.log("xEnchantedTokenURILens:        ", tokenUriLensAddr);
  console.log("xEnchantedStakeTokenURILens:   ", stakeTokenUriLensAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});