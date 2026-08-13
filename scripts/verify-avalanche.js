const hre = require("hardhat");
const { ethers } = hre;

const {
  AVALANCHE_MAINNET_CHAIN_ID,
  AXEN_MAINNET,
  INITIAL_NOMINAL_TEXT,
  INITIAL_XEN_BURN_TEXT,
  AVALANCHE_PROTOCOL_PROFILE,
} = require("./lib/avalanche-mainnet");
const {
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("./lib/protocol-profiles");

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

function requireAddresses() {
  for (const [name, address] of Object.entries(ADDR)) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
      throw new Error(`Missing or invalid ${name} verification address`);
    }
  }
}

async function verify(name, address, constructorArguments) {
  console.log(`Verifying ${name} at ${address}...`);

  try {
    await hre.run("verify:verify", { address, constructorArguments });
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (/already verified/i.test(message)) {
      console.log(`${name} is already verified.`);
      return;
    }
    throw error;
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== AVALANCHE_MAINNET_CHAIN_ID) {
    throw new Error(
      `Refusing verification: expected Avalanche C-Chain ${AVALANCHE_MAINNET_CHAIN_ID}, got ${network.chainId}`
    );
  }

  requireAddresses();

  const initialNominal = ethers.parseEther(INITIAL_NOMINAL_TEXT);
  const initialXenBurn = ethers.parseEther(INITIAL_XEN_BURN_TEXT);

  await verify(
    "Core",
    ADDR.Core,
    coreConstructorArgs(
      AXEN_MAINNET,
      initialNominal,
      initialXenBurn,
      AVALANCHE_PROTOCOL_PROFILE
    )
  );
  await verify("XNTD", ADDR.XNTD, [ADDR.Core]);
  await verify(
    "Stake",
    ADDR.Stake,
    stakeConstructorArgs(ADDR.Core, AVALANCHE_PROTOCOL_PROFILE)
  );
  await verify("Forge", ADDR.Forge, [ADDR.Core, ADDR.XNTD]);
  await verify("Market", ADDR.Market, [ADDR.Core]);
  await verify("NFTLens", ADDR.NFTLens, [ADDR.Core, ADDR.Stake]);
  await verify("TokenURILens", ADDR.TokenURILens, [ADDR.Core]);
  await verify("StakeTokenURILens", ADDR.StakeTokenURILens, [ADDR.Stake]);

  console.log("Avalanche source verification sequence completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
