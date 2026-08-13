const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ethers, network: hardhatNetwork } = require("hardhat");

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
  DEPLOY_CONFIRMATION,
  GENESIS_CONFIRMATION,
  INIT_CONFIRMATION,
} = require("./lib/avalanche-mainnet");
const {
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("./lib/protocol-profiles");
const {
  AVALANCHE_ADDRESS_ENV_BY_NAME,
} = require("./lib/avalanche-addresses");
const {
  requireReviewedSourceCommit,
} = require("./lib/avalanche-deployment-safety");

function requireConfirmation(envName, expected) {
  if (process.env[envName] !== expected) {
    throw new Error(`Refusing to deploy. Set ${envName}=${expected}`);
  }
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name] || fallback;
  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error(`${name} must be an integer from 1 to 100`);
  }

  return value;
}

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readSourceState() {
  const status = gitOutput(["status", "--porcelain"]);
  if (status !== "") {
    throw new Error(
      "Refusing to deploy from a dirty working tree. Commit and review the exact source first."
    );
  }

  return {
    commit: gitOutput(["rev-parse", "HEAD"]),
    branch: gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

function createManifest(source, deployer, confirmations) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = path.join(
    process.cwd(),
    "deployment-records",
    "avalanche-mainnet",
    `${stamp}-${source.commit.slice(0, 12)}.json`
  );
  const manifestPath = path.resolve(
    process.env.AVALANCHE_DEPLOYMENT_MANIFEST || defaultPath
  );

  if (fs.existsSync(manifestPath)) {
    throw new Error(`Refusing to overwrite deployment manifest ${manifestPath}`);
  }

  const manifest = {
    schema: "xc-avalanche-deployment-v2",
    status: "preflight-passed",
    startedAt: new Date().toISOString(),
    source,
    network: {
      name: "Avalanche C-Chain Mainnet",
      chainId: AVALANCHE_MAINNET_CHAIN_ID.toString(),
      nativeCurrency: AVALANCHE_NATIVE_SYMBOL,
    },
    deployer,
    confirmations,
    dependencies: {
      aXEN: AXEN_MAINNET,
    },
    genesis: {
      mode: "fresh-avalanche-genesis",
      initialNominalXNTD: INITIAL_NOMINAL_TEXT,
      initialXenBurnAXEN: INITIAL_XEN_BURN_TEXT,
      halvingIntervalSeconds:
        AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds,
      xenBurnHalvingIntervalSeconds:
        AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds,
      minStakeDays: AVALANCHE_PROTOCOL_PROFILE.minStakeDays,
      maxStakeDays: AVALANCHE_PROTOCOL_PROFILE.maxStakeDays,
    },
    contracts: {},
    transactions: [],
  };

  function save() {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const temporaryPath = `${manifestPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, manifestPath);
  }

  save();
  return { manifest, manifestPath, save };
}

async function requireCode(label, address) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label} has no deployed code at ${address}`);
  }
}

async function deployAndRecord(name, factory, args, state) {
  console.log(`Deploying ${name}...`);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error(`${name} deployment transaction is unavailable`);

  const receipt = await tx.wait(state.confirmations);
  const address = await contract.getAddress();

  state.manifest.contracts[name] = {
    address,
    deployTxHash: tx.hash,
    deployBlock: receipt.blockNumber,
  };
  state.manifest.status = `deployed-${name}`;
  state.save();

  console.log(`${name}:`, address);
  return contract;
}

async function sendAndRecord(label, txPromise, state) {
  const tx = await txPromise;
  const receipt = await tx.wait(state.confirmations);

  state.manifest.transactions.push({
    label,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  });
  state.manifest.status = label;
  state.save();

  console.log(`${label}:`, tx.hash);
  return receipt;
}

function same(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function requireSame(label, actual, expected) {
  if (!same(actual, expected)) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}`);
  }
}

function requireBigInt(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}`);
  }
}

async function main() {
  requireConfirmation("AVALANCHE_DEPLOY_CONFIRM", DEPLOY_CONFIRMATION);
  requireConfirmation("AVALANCHE_GENESIS_CONFIRM", GENESIS_CONFIRMATION);
  requireConfirmation("AVALANCHE_INIT_CONFIRM", INIT_CONFIRMATION);

  if (hardhatNetwork.name !== "avalanche") {
    throw new Error(
      `Refusing to deploy through Hardhat network '${hardhatNetwork.name}'. Use --network avalanche.`
    );
  }

  const confirmations = readPositiveInteger("AVALANCHE_CONFIRMATIONS", "3");
  const source = readSourceState();
  requireReviewedSourceCommit(source.commit, process.env.AVALANCHE_SOURCE_COMMIT);
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== AVALANCHE_MAINNET_CHAIN_ID) {
    throw new Error(
      `Refusing to deploy: expected Avalanche C-Chain ${AVALANCHE_MAINNET_CHAIN_ID}, got ${network.chainId}`
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer signer. Set AVALANCHE_DEPLOYER_PRIVATE_KEY for the avalanche network."
    );
  }

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  if (deployerBalance === 0n) {
    throw new Error("Deployer has zero AVAX balance");
  }

  await requireCode("aXEN", AXEN_MAINNET);

  const axen = await ethers.getContractAt(
    [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    AXEN_MAINNET
  );

  const [axenName, axenSymbol, axenDecimals] = await Promise.all([
    axen.name(),
    axen.symbol(),
    axen.decimals(),
  ]);

  if (
    axenName !== AXEN_EXPECTED_NAME ||
    axenSymbol !== AXEN_EXPECTED_SYMBOL ||
    Number(axenDecimals) !== AXEN_EXPECTED_DECIMALS
  ) {
    throw new Error(
      `Unexpected aXEN metadata: name=${axenName}, symbol=${axenSymbol}, decimals=${axenDecimals}`
    );
  }

  console.log("=== AVALANCHE MAINNET DEPLOY START ===");
  console.log("Source commit:", source.commit);
  console.log("Source branch:", source.branch);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(deployerBalance),
    AVALANCHE_NATIVE_SYMBOL
  );
  console.log("aXEN:", AXEN_MAINNET);
  console.log(
    "Protocol profile:",
    `${AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds}s / ` +
      `${AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds}s / ` +
      `${AVALANCHE_PROTOCOL_PROFILE.minStakeDays}-${AVALANCHE_PROTOCOL_PROFILE.maxStakeDays} stake days`
  );
  console.log("Confirmations per transaction:", confirmations.toString());

  const state = createManifest(source, deployer.address, confirmations);
  state.confirmations = confirmations;
  console.log("Deployment manifest:", state.manifestPath);

  const initialNominal = ethers.parseEther(INITIAL_NOMINAL_TEXT);
  const initialXenBurn = ethers.parseEther(INITIAL_XEN_BURN_TEXT);

  const core = await deployAndRecord(
    "Core",
    await ethers.getContractFactory("xEnchantedNFT"),
    coreConstructorArgs(
      AXEN_MAINNET,
      initialNominal,
      initialXenBurn,
      AVALANCHE_PROTOCOL_PROFILE
    ),
    state
  );
  const coreAddress = await core.getAddress();

  const xntd = await deployAndRecord(
    "XNTD",
    await ethers.getContractFactory("XNTDToken"),
    [coreAddress],
    state
  );
  const xntdAddress = await xntd.getAddress();

  const stake = await deployAndRecord(
    "Stake",
    await ethers.getContractFactory("xEnchantedStake"),
    stakeConstructorArgs(coreAddress, AVALANCHE_PROTOCOL_PROFILE),
    state
  );
  const stakeAddress = await stake.getAddress();

  const forge = await deployAndRecord(
    "Forge",
    await ethers.getContractFactory("xEnchantedForge"),
    [coreAddress, xntdAddress],
    state
  );
  const forgeAddress = await forge.getAddress();

  const market = await deployAndRecord(
    "Market",
    await ethers.getContractFactory("XenchantedMarket"),
    [coreAddress],
    state
  );

  const nftLens = await deployAndRecord(
    "NFTLens",
    await ethers.getContractFactory("xEnchantedNFTLens"),
    [coreAddress, stakeAddress],
    state
  );

  const tokenUriLens = await deployAndRecord(
    "TokenURILens",
    await ethers.getContractFactory("xEnchantedTokenURILens"),
    [coreAddress],
    state
  );
  const tokenUriLensAddress = await tokenUriLens.getAddress();

  const stakeTokenUriLens = await deployAndRecord(
    "StakeTokenURILens",
    await ethers.getContractFactory("xEnchantedStakeTokenURILens"),
    [stakeAddress],
    state
  );
  const stakeTokenUriLensAddress = await stakeTokenUriLens.getAddress();

  for (const [name, entry] of Object.entries(state.manifest.contracts)) {
    await requireCode(name, entry.address);
  }

  await sendAndRecord(
    "core-token-uri-lens-set",
    core.setTokenURILens(tokenUriLensAddress),
    state
  );
  await sendAndRecord(
    "stake-token-uri-lens-set-and-stake-deployer-burned",
    stake.setTokenURILens(stakeTokenUriLensAddress),
    state
  );

  // Explicit pre-init handshake. Core.init() repeats the critical checks on-chain,
  // but this phase makes a wrong deployment manifest visible before rights burn.
  requireSame("Core.XEN", await core.XEN(), AXEN_MAINNET);
  requireBigInt("Core.INITIAL_NOMINAL", await core.INITIAL_NOMINAL(), initialNominal);
  requireBigInt("Core.INITIAL_XEN_BURN", await core.INITIAL_XEN_BURN(), initialXenBurn);
  requireBigInt(
    "Core.HALVING_INTERVAL",
    await core.HALVING_INTERVAL(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.halvingIntervalSeconds)
  );
  requireBigInt(
    "Core.XEN_BURN_HALVING_INTERVAL",
    await core.XEN_BURN_HALVING_INTERVAL(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.xenBurnHalvingIntervalSeconds)
  );
  requireSame("XNTD.CORE", await xntd.CORE(), coreAddress);
  requireSame("Stake.CORE", await stake.CORE(), coreAddress);
  requireBigInt(
    "Stake.MIN_DAYS",
    await stake.MIN_DAYS(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.minStakeDays)
  );
  requireBigInt(
    "Stake.MAX_DAYS",
    await stake.MAX_DAYS(),
    BigInt(AVALANCHE_PROTOCOL_PROFILE.maxStakeDays)
  );
  requireSame("Forge.CORE", await forge.CORE(), coreAddress);
  requireSame("Forge.XNTD", await forge.XNTD(), xntdAddress);
  requireSame("Market.CORE", await market.CORE(), coreAddress);
  requireSame("NFTLens.CORE", await nftLens.CORE(), coreAddress);
  requireSame("NFTLens.STAKE", await nftLens.STAKE(), stakeAddress);
  requireSame("TokenURILens.CORE", await tokenUriLens.CORE(), coreAddress);
  requireSame(
    "StakeTokenURILens.STAKE",
    await stakeTokenUriLens.STAKE(),
    stakeAddress
  );
  requireSame("Core.DEPLOYER", await core.DEPLOYER(), deployer.address);
  requireSame("Stake.DEPLOYER", await stake.DEPLOYER(), ethers.ZeroAddress);

  if (await core.initialized()) throw new Error("Core is already initialized");
  if (await xntd.forgeBound()) throw new Error("XNTD Forge is already bound");

  state.manifest.status = "pre-init-handshake-passed";
  state.manifest.genesis.genesisTimestamp = (await core.GENESIS_TS()).toString();
  state.save();

  await sendAndRecord(
    "core-initialized-and-deployer-rights-burned",
    core.init(xntdAddress, stakeAddress, forgeAddress),
    state
  );

  requireSame("Core.XNTD", await core.XNTD(), xntdAddress);
  requireSame("Core.STAKING", await core.STAKING(), stakeAddress);
  requireSame("Core.FORGE", await core.FORGE(), forgeAddress);
  requireSame("Core.DEPLOYER", await core.DEPLOYER(), ethers.ZeroAddress);
  requireSame("XNTD.FORGE", await xntd.FORGE(), forgeAddress);

  if (!(await core.initialized())) throw new Error("Core init flag is false");
  if (!(await xntd.forgeBound())) throw new Error("XNTD Forge binding is false");

  state.manifest.status = "complete";
  state.manifest.completedAt = new Date().toISOString();
  state.save();

  console.log("=== AVALANCHE MAINNET DEPLOY COMPLETE ===");
  console.log("Manifest:", state.manifestPath);
  for (const [name, entry] of Object.entries(state.manifest.contracts)) {
    console.log(`${name}:`, entry.address);
  }
  console.log("Avalanche address environment block:");
  for (const [name, envName] of Object.entries(AVALANCHE_ADDRESS_ENV_BY_NAME)) {
    console.log(`${envName}=${state.manifest.contracts[name].address}`);
  }
  console.log("Run scripts/check-avalanche.js before frontend integration.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
