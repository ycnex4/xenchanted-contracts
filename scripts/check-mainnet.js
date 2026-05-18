const { ethers } = require("hardhat");

const ZERO = ethers.ZeroAddress;
const ETHEREUM_MAINNET_CHAIN_ID = 1n;
const XEN_MAINNET = "0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8";

const ADDR = {
  Core: process.env.CORE_ADDRESS || "",
  XNTD: process.env.XNTD_ADDRESS || "",
  Stake: process.env.STAKE_ADDRESS || "",
  Forge: process.env.FORGE_ADDRESS || "",
  Market: process.env.MARKET_ADDRESS || "",
  NFTLens: process.env.NFT_LENS_ADDRESS || "",
  TokenURILens: process.env.TOKEN_URI_LENS_ADDRESS || "",
  StakeTokenURILens: process.env.STAKE_TOKEN_URI_LENS_ADDRESS || "",
};

function envNameFor(name) {
  const map = {
    Core: "CORE_ADDRESS",
    XNTD: "XNTD_ADDRESS",
    Stake: "STAKE_ADDRESS",
    Forge: "FORGE_ADDRESS",
    Market: "MARKET_ADDRESS",
    NFTLens: "NFT_LENS_ADDRESS",
    TokenURILens: "TOKEN_URI_LENS_ADDRESS",
    StakeTokenURILens: "STAKE_TOKEN_URI_LENS_ADDRESS",
  };

  return map[name] || `${name.toUpperCase()}_ADDRESS`;
}

function requireAddress(name, value) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Missing or invalid ${name}. Set ${envNameFor(name)}.`);
  }
}

function same(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function assertEq(label, actual, expected) {
  if (!same(actual, expected)) {
    throw new Error(`${label} mismatch\n  actual:   ${actual}\n  expected: ${expected}`);
  }

  console.log(`OK ${label}: ${actual}`);
}

function assertBool(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch\n  actual:   ${actual}\n  expected: ${expected}`);
  }

  console.log(`OK ${label}: ${actual}`);
}

function assertNumberEq(label, actual, expected) {
  if (Number(actual) !== Number(expected)) {
    throw new Error(`${label} mismatch\n  actual:   ${actual}\n  expected: ${expected}`);
  }

  console.log(`OK ${label}: ${actual}`);
}

function assertBigIntEq(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch\n  actual:   ${actual}\n  expected: ${expected}`);
  }

  console.log(`OK ${label}: ${actual.toString()}`);
}

async function main() {
  const [signer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();

  console.log("=== MAINNET DEPLOYMENT CHECK ===");
  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "ETH");
  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error(`Refusing to check: expected Ethereum mainnet chainId 1, got ${network.chainId}`);
  }

  for (const [name, value] of Object.entries(ADDR)) {
    requireAddress(name, value);
  }

  console.log("\n=== INPUT ADDRESSES ===");
  for (const [name, value] of Object.entries(ADDR)) {
    console.log(`${name}:`, value);
  }

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

  if (xenSymbol !== "XEN") {
    throw new Error(`Unexpected XEN symbol: ${xenSymbol}`);
  }

  assertNumberEq("Real XEN.decimals", xenDecimals, 18);

  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const XNTD = await ethers.getContractFactory("XNTDToken");
  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const Market = await ethers.getContractFactory("XenchantedMarket");
  const NFTLens = await ethers.getContractFactory("xEnchantedNFTLens");
  const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
  const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");

  const core = Core.attach(ADDR.Core);
  const xntd = XNTD.attach(ADDR.XNTD);
  const stake = Stake.attach(ADDR.Stake);
  const forge = Forge.attach(ADDR.Forge);
  const market = Market.attach(ADDR.Market);
  const nftLens = NFTLens.attach(ADDR.NFTLens);
  const tokenUriLens = TokenURILens.attach(ADDR.TokenURILens);
  const stakeTokenUriLens = StakeTokenURILens.attach(ADDR.StakeTokenURILens);

  console.log("\n=== CORE WIRING ===");
  assertEq("Core.XEN", await core.XEN(), XEN_MAINNET);
  assertEq("Core.XNTD", await core.XNTD(), ADDR.XNTD);
  assertEq("Core.STAKING", await core.STAKING(), ADDR.Stake);
  assertEq("Core.FORGE", await core.FORGE(), ADDR.Forge);
  assertEq("Core.TOKEN_URI_LENS", await core.TOKEN_URI_LENS(), ADDR.TokenURILens);
  assertBool("Core.initialized", await core.initialized(), true);
  assertEq("Core.DEPLOYER burned", await core.DEPLOYER(), ZERO);

  console.log("\n=== STAKE WIRING ===");
  assertEq("Stake.CORE", await stake.CORE(), ADDR.Core);
  assertEq("Stake.TOKEN_URI_LENS", await stake.TOKEN_URI_LENS(), ADDR.StakeTokenURILens);
  assertEq("Stake.DEPLOYER burned", await stake.DEPLOYER(), ZERO);

  console.log("\n=== XNTD WIRING ===");
  assertEq("XNTD.CORE", await xntd.CORE(), ADDR.Core);
  assertEq("XNTD.FORGE", await xntd.FORGE(), ADDR.Forge);
  assertBool("XNTD.forgeBound", await xntd.forgeBound(), true);

  console.log("\n=== FORGE WIRING ===");
  assertEq("Forge.CORE", await forge.CORE(), ADDR.Core);
  assertEq("Forge.XNTD", await forge.XNTD(), ADDR.XNTD);

  console.log("\n=== MARKET WIRING ===");
  assertEq("Market.CORE", await market.CORE(), ADDR.Core);
  assertBigIntEq("Market.MAX_PAGE_SIZE", await market.MAX_PAGE_SIZE(), 100n);
  assertBigIntEq("Market.activeListingCount", await market.activeListingCount(), 0n);
  assertBigIntEq("Market.nextListingId", await market.nextListingId(), 1n);

  console.log("\n=== LENS WIRING ===");
  assertEq("NFTLens.CORE", await nftLens.CORE(), ADDR.Core);
  assertEq("NFTLens.STAKE", await nftLens.STAKE(), ADDR.Stake);
  assertEq("TokenURILens.CORE", await tokenUriLens.CORE(), ADDR.Core);
  assertEq("StakeTokenURILens.STAKE", await stakeTokenUriLens.STAKE(), ADDR.Stake);

  console.log("\n=== PROTOCOL PARAMETER CHECK ===");
  console.log("Core.INITIAL_NOMINAL:", ethers.formatEther(await core.INITIAL_NOMINAL()), "XNTD");
  console.log("Core.INITIAL_XEN_BURN:", ethers.formatEther(await core.INITIAL_XEN_BURN()), "XEN");
  console.log("Core.GENESIS_TS:", (await core.GENESIS_TS()).toString());
  console.log("Core.HALVING_INTERVAL:", (await core.HALVING_INTERVAL()).toString());
  console.log("Core.currentEpoch:", (await core.currentEpoch()).toString());
  console.log("Core.currentBaseNominal:", ethers.formatEther(await core.currentBaseNominal()), "XNTD");
  console.log("Core.currentXenBurnAmount:", ethers.formatEther(await core.currentXenBurnAmount()), "XEN");
  console.log("Core.nextHalvingTs:", (await core.nextHalvingTs()).toString());
  console.log("Core.baseAprBpsNow:", (await core.baseAprBpsNow()).toString());

  console.log("\n=== MAINNET CHECK COMPLETE ===");
  console.log("All deployment wiring checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
