const { ethers } = require("hardhat");

const {
  AVALANCHE_MAINNET_CHAIN_ID,
  AVALANCHE_NATIVE_SYMBOL,
  AXEN_MAINNET,
  AXEN_EXPECTED_NAME,
  AXEN_EXPECTED_SYMBOL,
  AXEN_EXPECTED_DECIMALS,
} = require("./lib/avalanche-mainnet");

async function main() {
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== AVALANCHE_MAINNET_CHAIN_ID) {
    throw new Error(
      `Refusing preflight: expected Avalanche C-Chain ${AVALANCHE_MAINNET_CHAIN_ID}, got ${network.chainId}`
    );
  }

  const code = await ethers.provider.getCode(AXEN_MAINNET);
  if (code === "0x") {
    throw new Error(`No contract code at configured aXEN address ${AXEN_MAINNET}`);
  }

  const axen = await ethers.getContractAt(
    [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    AXEN_MAINNET
  );

  const [name, symbol, decimals, blockNumber, feeData] = await Promise.all([
    axen.name(),
    axen.symbol(),
    axen.decimals(),
    ethers.provider.getBlockNumber(),
    ethers.provider.getFeeData(),
  ]);

  if (
    name !== AXEN_EXPECTED_NAME ||
    symbol !== AXEN_EXPECTED_SYMBOL ||
    Number(decimals) !== AXEN_EXPECTED_DECIMALS
  ) {
    throw new Error(
      `Unexpected aXEN metadata: name=${name}, symbol=${symbol}, decimals=${decimals}`
    );
  }

  console.log("=== AVALANCHE READ-ONLY PREFLIGHT ===");
  console.log("Chain ID:", network.chainId.toString());
  console.log("Latest block:", blockNumber.toString());
  console.log("Native currency:", AVALANCHE_NATIVE_SYMBOL);
  console.log("aXEN:", AXEN_MAINNET);
  console.log("aXEN code bytes:", ((code.length - 2) / 2).toString());
  console.log("aXEN name:", name);
  console.log("aXEN symbol:", symbol);
  console.log("aXEN decimals:", decimals.toString());
  console.log(
    "Gas price:",
    feeData.gasPrice == null ? "unavailable" : feeData.gasPrice.toString()
  );
  console.log("Preflight passed. No transaction was sent.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
