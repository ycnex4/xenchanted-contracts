const { ethers } = require("hardhat");

const {
  AVALANCHE_MAINNET_CHAIN_ID,
  AVALANCHE_NATIVE_SYMBOL,
  AXEN_MAINNET,
  AXEN_EXPECTED_NAME,
  AXEN_EXPECTED_SYMBOL,
  AXEN_EXPECTED_DECIMALS,
  INITIAL_NOMINAL_TEXT,
  INITIAL_XEN_BURN_TEXT,
  AVALANCHE_PROTOCOL_PROFILE,
} = require("./lib/avalanche-mainnet");
const {
  AVALANCHE_ADDRESS_ENV_BY_NAME,
  readAvalancheAddresses,
} = require("./lib/avalanche-addresses");

const ZERO = ethers.ZeroAddress;
const ADDR = readAvalancheAddresses();

function same(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function assertEq(label, actual, expected) {
  if (!same(actual, expected)) {
    throw new Error(`${label} mismatch\n  actual: ${actual}\n  expected: ${expected}`);
  }
  console.log(`OK ${label}: ${actual}`);
}

function assertBool(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}`);
  }
  console.log(`OK ${label}: ${actual}`);
}

function assertBigInt(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}`);
  }
  console.log(`OK ${label}: ${actual.toString()}`);
}

async function requireAddressAndCode(name, value) {
  if (!ethers.isAddress(value) || value === ZERO) {
    throw new Error(
      `Missing or invalid ${name}. Set ${AVALANCHE_ADDRESS_ENV_BY_NAME[name]}.`
    );
  }

  const code = await ethers.provider.getCode(value);
  if (code === "0x") {
    throw new Error(`${name} has no deployed code at ${value}`);
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== AVALANCHE_MAINNET_CHAIN_ID) {
    throw new Error(
      `Refusing to check: expected Avalanche C-Chain ${AVALANCHE_MAINNET_CHAIN_ID}, got ${network.chainId}`
    );
  }

  console.log("=== AVALANCHE MAINNET DEPLOYMENT CHECK ===");
  console.log("Chain ID:", network.chainId.toString());
  console.log("Native currency:", AVALANCHE_NATIVE_SYMBOL);
  console.log("Latest block:", (await ethers.provider.getBlockNumber()).toString());

  await requireAddressAndCode("aXEN", AXEN_MAINNET);
  for (const [name, value] of Object.entries(ADDR)) {
    await requireAddressAndCode(name, value);
  }

  const axen = await ethers.getContractAt(
    [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    AXEN_MAINNET
  );

  assertEq("aXEN.name", await axen.name(), AXEN_EXPECTED_NAME);
  assertEq("aXEN.symbol", await axen.symbol(), AXEN_EXPECTED_SYMBOL);
  assertBigInt(
    "aXEN.decimals",
    BigInt(await axen.decimals()),
    BigInt(AXEN_EXPECTED_DECIMALS)
  );

  const core = (await ethers.getContractFactory("xEnchantedNFT")).attach(ADDR.Core);
  const xntd = (await ethers.getContractFactory("XNTDToken")).attach(ADDR.XNTD);
  const stake = (await ethers.getContractFactory("xEnchantedStake")).attach(ADDR.Stake);
  const forge = (await ethers.getContractFactory("xEnchantedForge")).attach(ADDR.Forge);
  const market = (await ethers.getContractFactory("XenchantedMarket")).attach(ADDR.Market);
  const nftLens = (await ethers.getContractFactory("xEnchantedNFTLens")).attach(ADDR.NFTLens);
  const tokenUriLens = (
    await ethers.getContractFactory("xEnchantedTokenURILens")
  ).attach(ADDR.TokenURILens);
  const stakeTokenUriLens = (
    await ethers.getContractFactory("xEnchantedStakeTokenURILens")
  ).attach(ADDR.StakeTokenURILens);

  console.log("=== CORE WIRING ===");
  assertEq("Core.XEN", await core.XEN(), AXEN_MAINNET);
  assertEq("Core.XNTD", await core.XNTD(), ADDR.XNTD);
  assertEq("Core.STAKING", await core.STAKING(), ADDR.Stake);
  assertEq("Core.FORGE", await core.FORGE(), ADDR.Forge);
  assertEq("Core.TOKEN_URI_LENS", await core.TOKEN_URI_LENS(), ADDR.TokenURILens);
  assertBool("Core.initialized", await core.initialized(), true);
  assertEq("Core.DEPLOYER burned", await core.DEPLOYER(), ZERO);

  console.log("=== STAKE / XNTD / FORGE WIRING ===");
  assertEq("Stake.CORE", await stake.CORE(), ADDR.Core);
  assertEq("Stake.TOKEN_URI_LENS", await stake.TOKEN_URI_LENS(), ADDR.StakeTokenURILens);
  assertEq("Stake.DEPLOYER burned", await stake.DEPLOYER(), ZERO);
  assertEq("XNTD.CORE", await xntd.CORE(), ADDR.Core);
  assertEq("XNTD.FORGE", await xntd.FORGE(), ADDR.Forge);
  assertBool("XNTD.forgeBound", await xntd.forgeBound(), true);
  assertEq("Forge.CORE", await forge.CORE(), ADDR.Core);
  assertEq("Forge.XNTD", await forge.XNTD(), ADDR.XNTD);

  console.log("=== MARKET / LENS WIRING ===");
  assertEq("Market.CORE", await market.CORE(), ADDR.Core);
  assertBigInt("Market.MAX_PAGE_SIZE", await market.MAX_PAGE_SIZE(), 100n);
  assertEq("NFTLens.CORE", await nftLens.CORE(), ADDR.Core);
  assertEq("NFTLens.STAKE", await nftLens.STAKE(), ADDR.Stake);
  assertEq("TokenURILens.CORE", await tokenUriLens.CORE(), ADDR.Core);
  assertEq("StakeTokenURILens.STAKE", await stakeTokenUriLens.STAKE(), ADDR.Stake);

  if (process.env.AVALANCHE_EXPECT_FRESH_DEPLOYMENT === "1") {
    assertBigInt("Market.activeListingCount", await market.activeListingCount(), 0n);
    assertBigInt("Market.nextListingId", await market.nextListingId(), 1n);
  } else {
    console.log("Market.activeListingCount:", (await market.activeListingCount()).toString());
    console.log("Market.nextListingId:", (await market.nextListingId()).toString());
  }

  console.log("=== IMMUTABLE ECONOMIC PARAMETERS ===");
  assertBigInt(
    "Core.INITIAL_NOMINAL",
    await core.INITIAL_NOMINAL(),
    ethers.parseEther(INITIAL_NOMINAL_TEXT)
  );
  assertBigInt(
    "Core.INITIAL_XEN_BURN",
    await core.INITIAL_XEN_BURN(),
    ethers.parseEther(INITIAL_XEN_BURN_TEXT)
  );
  assertBigInt(
    "Core.HALVING_INTERVAL",
    await core.HALVING_INTERVAL(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds)
  );
  assertBigInt(
    "Core.XEN_BURN_HALVING_INTERVAL",
    await core.XEN_BURN_HALVING_INTERVAL(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds)
  );
  assertBigInt(
    "Stake.MIN_DAYS",
    await stake.MIN_DAYS(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.minStakeDays)
  );
  assertBigInt(
    "Stake.MAX_DAYS",
    await stake.MAX_DAYS(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.maxStakeDays)
  );

  const latestBlock = await ethers.provider.getBlock("latest");
  const genesisTimestamp = await core.GENESIS_TS();
  if (genesisTimestamp === 0n || genesisTimestamp > BigInt(latestBlock.timestamp)) {
    throw new Error(`Invalid Core.GENESIS_TS ${genesisTimestamp}`);
  }

  console.log("Core.GENESIS_TS:", genesisTimestamp.toString());
  console.log("Core.currentEpoch:", (await core.currentEpoch()).toString());
  console.log("Core.currentBaseNominal:", ethers.formatEther(await core.currentBaseNominal()));
  console.log("Core.currentXenBurnAmount:", ethers.formatEther(await core.currentXenBurnAmount()));
  console.log("Core.baseAprBpsNow:", (await core.baseAprBpsNow()).toString());
  console.log("All Avalanche deployment checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
