const { ethers } = require("hardhat");

const CORE_ADDR = "0x3E47CFEDD2D6FFcD7E9C7407e5ab2fF19948b837";
const STAKE_ADDR = "0x4E93035871c2a429bcc9ECD8f63400f6faAb1DCE";

// ВСТАВЬ СЮДА ID ЖИВОГО L2
const TOKEN_ID = 4n;
const DURATION_DAYS = 30;

async function main() {
  const [signer] = await ethers.getSigners();

  const core = await ethers.getContractAt("xEnchantedNFT", CORE_ADDR, signer);
  const stake = await ethers.getContractAt("xEnchantedStake", STAKE_ADDR, signer);

  console.log("Signer:", signer.address);
  console.log("Core:", CORE_ADDR);
  console.log("Stake:", STAKE_ADDR);
  console.log("Token ID:", TOKEN_ID.toString());
  console.log("Duration:", DURATION_DAYS);

  console.log("\n--- Wiring ---");
  console.log("core.initialized():", await core.initialized());
  console.log("core.STAKING():", await core.STAKING());
  console.log("stake.CORE():", await stake.CORE());

  console.log("\n--- Core token state ---");
  console.log("core.exists(tokenId):", await core.exists(TOKEN_ID));

  try {
    console.log("core.ownerOf(tokenId):", await core.ownerOf(TOKEN_ID));
  } catch (e) {
    console.log("core.ownerOf(tokenId) reverted:", e.shortMessage || e.message);
  }

  try {
    console.log("core.nftData(tokenId):", await core.nftData(TOKEN_ID));
  } catch (e) {
    console.log("core.nftData(tokenId) reverted:", e.shortMessage || e.message);
  }

  console.log("\n--- Stake token state ---");
  try {
    console.log("stake.ownerOf(tokenId):", await stake.ownerOf(TOKEN_ID));
  } catch (e) {
    console.log("stake.ownerOf(tokenId): no stake NFT yet");
  }

  try {
    console.log("stake.getPos(tokenId):", await stake.getPos(TOKEN_ID));
  } catch (e) {
    console.log("stake.getPos(tokenId) reverted:", e.shortMessage || e.message);
  }

  console.log("\n--- previewStake ---");
  try {
    console.log(
      "stake.previewStake(tokenId, 30):",
      await stake.previewStake(TOKEN_ID, DURATION_DAYS)
    );
  } catch (e) {
    console.log("previewStake reverted:", e.shortMessage || e.message);
  }

  console.log("\n--- staticCall stake ---");
  try {
    await stake.stake.staticCall(TOKEN_ID, DURATION_DAYS);
    console.log("staticCall: OK");
  } catch (e) {
    console.log("staticCall reverted");
    console.log("shortMessage:", e.shortMessage);
    console.log("reason:", e.reason);
    console.log("message:", e.message);
    console.log("data:", e.data);
  }

  console.log("\n--- estimateGas stake ---");
  try {
    const gas = await stake.stake.estimateGas(TOKEN_ID, DURATION_DAYS);
    console.log("estimateGas:", gas.toString());
  } catch (e) {
    console.log("estimateGas reverted");
    console.log("shortMessage:", e.shortMessage);
    console.log("reason:", e.reason);
    console.log("message:", e.message);
    console.log("data:", e.data);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});