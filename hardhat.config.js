require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

function addHttpNetwork(networks, name, url, privateKey) {
  // Keep local compile/test usable on a clean machine without a secrets file.
  // A named remote network only exists when its RPC URL is intentionally set.
  if (!url) return;

  networks[name] = {
    url,
    accounts: privateKey ? [privateKey] : [],
  };
}

const networks = {};

addHttpNetwork(
  networks,
  "sepolia",
  process.env.SEPOLIA_RPC_URL,
  process.env.SEPOLIA_PRIVATE_KEY
);

addHttpNetwork(
  networks,
  "mainnet",
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_PRIVATE_KEY
);

addHttpNetwork(
  networks,
  "avalanche",
  process.env.AVALANCHE_RPC_URL,
  process.env.AVALANCHE_DEPLOYER_PRIVATE_KEY
);

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks,
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      // Avalanche's documented Snowtrace flow accepts a placeholder when no
      // API key is required. Keep an override for provider/API changes.
      avalanche: process.env.SNOWTRACE_API_KEY || "no-api-key-required",
    },
  },
};
