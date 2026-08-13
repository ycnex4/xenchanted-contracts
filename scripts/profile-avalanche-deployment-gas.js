const { ethers, network } = require("hardhat");

const {
  AXEN_MAINNET,
  INITIAL_NOMINAL_TEXT,
  INITIAL_XEN_BURN_TEXT,
} = require("./lib/avalanche-mainnet");

async function main() {
  if (!process.env.AVALANCHE_RPC_URL) {
    throw new Error("AVALANCHE_RPC_URL is required for the Avalanche fork profile");
  }

  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.AVALANCHE_RPC_URL } }],
  });
  await network.provider.request({ method: "evm_mine", params: [] });

  const rows = [];
  let totalGas = 0n;

  function record(label, gasUsed) {
    rows.push({ label, gasUsed });
    totalGas += gasUsed;
  }

  async function deploy(label, contractName, args) {
    const factory = await ethers.getContractFactory(contractName);
    const contract = await factory.deploy(...args);
    const receipt = await contract.deploymentTransaction().wait();
    record(label, receipt.gasUsed);
    return contract;
  }

  async function transact(label, txPromise) {
    const receipt = await (await txPromise).wait();
    record(label, receipt.gasUsed);
  }

  const initialNominal = ethers.parseEther(INITIAL_NOMINAL_TEXT);
  const initialXenBurn = ethers.parseEther(INITIAL_XEN_BURN_TEXT);
  const feeData = await ethers.provider.getFeeData();

  const core = await deploy("Deploy Core", "xEnchantedNFT", [
    AXEN_MAINNET,
    initialNominal,
    initialXenBurn,
  ]);
  const coreAddress = await core.getAddress();

  const xntd = await deploy("Deploy XNTD", "XNTDToken", [coreAddress]);
  const xntdAddress = await xntd.getAddress();

  const stake = await deploy("Deploy Stake", "xEnchantedStake", [coreAddress]);
  const stakeAddress = await stake.getAddress();

  const forge = await deploy("Deploy Forge", "xEnchantedForge", [
    coreAddress,
    xntdAddress,
  ]);
  const forgeAddress = await forge.getAddress();

  await deploy("Deploy Market", "XenchantedMarket", [coreAddress]);
  await deploy("Deploy NFT Lens", "xEnchantedNFTLens", [coreAddress, stakeAddress]);
  const tokenUriLens = await deploy(
    "Deploy Core tokenURI Lens",
    "xEnchantedTokenURILens",
    [coreAddress]
  );
  const stakeTokenUriLens = await deploy(
    "Deploy Stake tokenURI Lens",
    "xEnchantedStakeTokenURILens",
    [stakeAddress]
  );

  await transact(
    "Set Core tokenURI Lens",
    core.setTokenURILens(await tokenUriLens.getAddress())
  );
  await transact(
    "Set Stake tokenURI Lens",
    stake.setTokenURILens(await stakeTokenUriLens.getAddress())
  );
  await transact(
    "Core.init / bind Forge / burn rights",
    core.init(xntdAddress, stakeAddress, forgeAddress)
  );

  console.log("=== AVALANCHE FORK DEPLOYMENT GAS PROFILE ===");
  console.log("| Transaction | Gas used |");
  console.log("| --- | ---: |");
  for (const row of rows) {
    console.log(`| ${row.label} | ${row.gasUsed.toString()} |`);
  }
  console.log("Total gas:", totalGas.toString());

  if (feeData.gasPrice != null) {
    console.log("Hardhat fork fee quote (wei):", feeData.gasPrice.toString());
    console.log(
      "Estimated total at sampled gas price (AVAX):",
      ethers.formatEther(totalGas * feeData.gasPrice)
    );
  }

  console.log("Use a fresh live-network preflight fee quote for the real budget.");
  console.log("This was a local fork profile. No Avalanche transaction was sent.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
