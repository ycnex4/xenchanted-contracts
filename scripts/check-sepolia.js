const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);

  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const network = await ethers.provider.getNetwork();
  console.log("Chain ID:", network.chainId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});