const { ethers, network } = require("hardhat");

const XEN_MAINNET = "0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8";

async function main() {
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

  const [deployer, user] = await ethers.getSigners();

  const fee = {
    maxFeePerGas: ethers.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  };

  const rows = [];

  function push(label, gas) {
    rows.push({ label, gas });
    console.log(`[gas] ${label}: ${gas.toString()}`);
  }

  async function measure(label, txPromise) {
    const tx = await txPromise;
    const rc = await tx.wait();
    push(label, rc.gasUsed);
    return rc;
  }

  const xenWhale = process.env.XEN_WHALE;
  const initialNominal = ethers.parseEther("100");
  const initialXenBurn = ethers.parseEther("100000000");

  console.log("\n=== Real XEN Mainnet Fork Gas Profile ===");
  console.log("XEN:", XEN_MAINNET);
  console.log("Initial nominal:", ethers.formatEther(initialNominal), "XNTD");
  console.log("Initial XEN burn:", ethers.formatEther(initialXenBurn), "XEN");
  console.log("Receiver type: EOA");
  console.log("Setup/deploy/wiring transactions are not included unless explicitly listed.\n");

  // -----------------------------
  // Deploy local protocol on fork
  // -----------------------------
  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const XNTD = await ethers.getContractFactory("XNTDToken");
  const CoreTokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
  const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");

  const core = await Core.deploy(XEN_MAINNET, initialNominal, initialXenBurn, fee);
  await core.waitForDeployment();

  const xntd = await XNTD.deploy(await core.getAddress(), fee);
  await xntd.waitForDeployment();

  const stake = await Stake.deploy(await core.getAddress(), fee);
  await stake.waitForDeployment();

  const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress(), fee);
  await forge.waitForDeployment();

  const coreLens = await CoreTokenURILens.deploy(await core.getAddress(), fee);
  await coreLens.waitForDeployment();

  const stakeLens = await StakeTokenURILens.deploy(await stake.getAddress(), fee);
  await stakeLens.waitForDeployment();

  await (await core.setTokenURILens(await coreLens.getAddress(), fee)).wait();
  await (await stake.setTokenURILens(await stakeLens.getAddress(), fee)).wait();
  await (await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress(), fee)).wait();

  const xen = await ethers.getContractAt(
    [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ],
    XEN_MAINNET
  );

  const symbol = await xen.symbol();
  const decimals = await xen.decimals();

  if (symbol !== "XEN" || decimals !== 18n && decimals !== 18) {
    throw new Error(`Unexpected XEN metadata: symbol=${symbol}, decimals=${decimals}`);
  }

  const xenAmount = await core.currentXenBurnAmount();
  const whaleBalance = await xen.balanceOf(xenWhale);

  if (whaleBalance < xenAmount) {
    throw new Error("XEN_WHALE does not have enough XEN for this fork profile");
  }

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

  // Funding user is measured separately for visibility but is not a protocol user flow.
  await measure(
    "Real XEN transfer whale -> user",
    xen.connect(whaleSigner).transfer(user.address, xenAmount, fee)
  );

  const userXen = await xen.balanceOf(user.address);
  if (userXen < xenAmount) {
    throw new Error("User did not receive enough XEN");
  }

  await measure(
    "Real XEN approve Core",
    xen.connect(user).approve(await core.getAddress(), xenAmount, fee)
  );

  const allowance = await xen.allowance(user.address, await core.getAddress());
  if (allowance < xenAmount) {
    throw new Error("Core allowance was not set");
  }

  await measure(
    "Core mintWithXEN against real XEN",
    core.connect(user).mintWithXEN(fee)
  );

  const coreBalance = await core.balanceOf(user.address);
  if (coreBalance !== 1n) {
    throw new Error("mintWithXEN did not mint exactly one Core NFT");
  }

  const data = await core.nftData(1);

  if (
    data.level !== 1n && data.level !== 1 ||
    data.isForged !== false ||
    data.nominal !== initialNominal ||
    data.xenBurned !== xenAmount ||
    data.xntdBurned !== 0n
  ) {
    throw new Error("Unexpected Core L1 data after real XEN mintWithXEN");
  }

  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [xenWhale],
  });

  console.log("\n=== Real XEN Fork Gas Profile Summary ===");
  console.log("| Flow | Gas Used |");
  console.log("| --- | ---: |");
  for (const row of rows) {
    console.log(`| ${row.label} | ${row.gas.toString()} |`);
  }

  console.log("\nNotes:");
  console.log("- This profile runs on a local Hardhat mainnet fork.");
  console.log("- It does not send real mainnet transactions.");
  console.log("- Funding transfer is measured for visibility but is not a protocol flow.");
  console.log("- The main protocol measurement is approve + mintWithXEN against real XEN.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
