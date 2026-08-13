const { ethers } = require("hardhat");

const ETHEREUM_MAINNET_CHAIN_ID = 1n;
const XEN_MAINNET = "0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8";

const REQUIRED_CONFIRMATION = "I_UNDERSTAND_THIS_DEPLOYS_TO_MAINNET";
const {
  ETHEREUM_PROTOCOL_PROFILE,
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("./lib/protocol-profiles");

async function main() {
  if (process.env.MAINNET_DEPLOY_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      "Refusing to deploy. Set MAINNET_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_DEPLOYS_TO_MAINNET only when you are ready to deploy to Ethereum mainnet."
    );
  }

  const network = await ethers.provider.getNetwork();

  if (network.chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error(`Refusing to deploy: expected Ethereum mainnet chainId 1, got ${network.chainId}`);
  }

  const [deployer] = await ethers.getSigners();

  console.log("=== MAINNET DEPLOY START ===");
  console.log("Network chainId:", network.chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Real XEN:", XEN_MAINNET);

  const xen = await ethers.getContractAt(
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    XEN_MAINNET
  );

  const xenSymbol = await xen.symbol();
  const xenDecimals = await xen.decimals();

  if (xenSymbol !== "XEN" || Number(xenDecimals) !== 18) {
    throw new Error(`Unexpected XEN metadata: symbol=${xenSymbol}, decimals=${xenDecimals}`);
  }

  // -----------------------------
  // PRODUCTION GENESIS CONFIG
  // -----------------------------
  // Immutable for this deployment because these values are passed into
  // the xEnchantedNFT constructor.
  //
  // Core L1 genesis:
  // burn 100,000,000 XEN -> mint Core L1 with 100 XNTD nominal
  //
  // Ratio:
  // 1 XNTD nominal : 1,000,000 XEN burned
  const INITIAL_NOMINAL = ethers.parseEther("100");
  const INITIAL_XEN_BURN = ethers.parseEther("100000000");

  console.log("\n=== PRODUCTION GENESIS CONFIG ===");
  console.log("Initial nominal:", ethers.formatEther(INITIAL_NOMINAL), "XNTD");
  console.log("Initial XEN burn:", ethers.formatEther(INITIAL_XEN_BURN), "XEN");
  console.log("Genesis ratio: 1 XNTD nominal : 1,000,000 XEN burned");

  // -----------------------------
  // 1) Deploy Core with REAL XEN
  // -----------------------------
  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const core = await Core.deploy(
    ...coreConstructorArgs(
      XEN_MAINNET,
      INITIAL_NOMINAL,
      INITIAL_XEN_BURN,
      ETHEREUM_PROTOCOL_PROFILE
    )
  );
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("Core deployed:", coreAddr);

  // -----------------------------
  // 2) Deploy XNTD
  // -----------------------------
  const XNTD = await ethers.getContractFactory("XNTDToken");
  const xntd = await XNTD.deploy(coreAddr);
  await xntd.waitForDeployment();
  const xntdAddr = await xntd.getAddress();
  console.log("XNTD deployed:", xntdAddr);

  // -----------------------------
  // 3) Deploy Stake
  // -----------------------------
  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const stake = await Stake.deploy(
    ...stakeConstructorArgs(coreAddr, ETHEREUM_PROTOCOL_PROFILE)
  );
  await stake.waitForDeployment();
  const stakeAddr = await stake.getAddress();
  console.log("Stake deployed:", stakeAddr);

  // -----------------------------
  // 4) Deploy Forge
  // -----------------------------
  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const forge = await Forge.deploy(coreAddr, xntdAddr);
  await forge.waitForDeployment();
  const forgeAddr = await forge.getAddress();
  console.log("Forge deployed:", forgeAddr);

  // -----------------------------
  // 5) Deploy Market
  // -----------------------------
  // Market is independent from Core init/wiring.
  // It only stores the immutable Core ERC721 address.
  const Market = await ethers.getContractFactory("XenchantedMarket");
  const market = await Market.deploy(coreAddr);
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("Market deployed:", marketAddr);

  // -----------------------------
  // 6) Deploy Lens contracts
  // -----------------------------
  const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
  const nftLens = await NFTLens.deploy(coreAddr, stakeAddr);
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
  await (await core.setTokenURILens(tokenUriLensAddr)).wait();
  console.log("Core tokenURI lens set");

  console.log("Setting Stake tokenURI lens...");
  await (await stake.setTokenURILens(stakeTokenUriLensAddr)).wait();
  console.log("Stake tokenURI lens set");

  // -----------------------------
  // 8) Init Core
  // -----------------------------
  console.log("Initializing Core...");
  await (await core.init(xntdAddr, stakeAddr, forgeAddr)).wait();
  console.log("Core initialized");

  // -----------------------------
  // DONE
  // -----------------------------
  console.log("\n=== MAINNET DEPLOY COMPLETE ===");
  console.log("XEN:", XEN_MAINNET);
  console.log("Core:", coreAddr);
  console.log("XNTD:", xntdAddr);
  console.log("Stake:", stakeAddr);
  console.log("Forge:", forgeAddr);
  console.log("Market:", marketAddr);
  console.log("xEnchantedNFTLens:", nftLensAddr);
  console.log("xEnchantedTokenURILens:", tokenUriLensAddr);
  console.log("xEnchantedStakeTokenURILens:", stakeTokenUriLensAddr);

  console.log("\n=== ENV FOR CHECK SCRIPT ===");
  console.log(`CORE_ADDRESS=${coreAddr}`);
  console.log(`XNTD_ADDRESS=${xntdAddr}`);
  console.log(`STAKE_ADDRESS=${stakeAddr}`);
  console.log(`FORGE_ADDRESS=${forgeAddr}`);
  console.log(`MARKET_ADDRESS=${marketAddr}`);
  console.log(`NFT_LENS_ADDRESS=${nftLensAddr}`);
  console.log(`TOKEN_URI_LENS_ADDRESS=${tokenUriLensAddr}`);
  console.log(`STAKE_TOKEN_URI_LENS_ADDRESS=${stakeTokenUriLensAddr}`);

  console.log("\n=== VERIFIED GENESIS CONFIG ===");
  console.log("Initial nominal:", ethers.formatEther(await core.INITIAL_NOMINAL()), "XNTD");
  console.log("Initial XEN burn:", ethers.formatEther(await core.INITIAL_XEN_BURN()), "XEN");
  console.log("Current epoch:", (await core.currentEpoch()).toString());
  console.log("Current base nominal:", ethers.formatEther(await core.currentBaseNominal()), "XNTD");
  console.log("Current XEN burn amount:", ethers.formatEther(await core.currentXenBurnAmount()), "XEN");

  console.log("\n=== MARKET CONFIG ===");
  console.log("Market.CORE:", await market.CORE());
  console.log("Market.MAX_PAGE_SIZE:", (await market.MAX_PAGE_SIZE()).toString());
  console.log("Market.activeListingCount:", (await market.activeListingCount()).toString());
  console.log("Market.nextListingId:", (await market.nextListingId()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
