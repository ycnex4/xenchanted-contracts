const { ethers, network } = require("hardhat");

const DAY = 24 * 60 * 60;
const HIGH_LEVEL = Number(process.env.PROFILE_HIGH_LEVEL || "6");
const {
  ETHEREUM_PROTOCOL_PROFILE,
  coreConstructorArgs,
  stakeConstructorArgs,
} = require("./lib/protocol-profiles");

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const rows = [];

  function gasText(gas) {
    return gas.toString();
  }

  function push(label, gas) {
    rows.push({ label, gas });
    console.log(`[gas] ${label}: ${gasText(gas)}`);
  }

  async function measure(label, txPromise) {
    const tx = await txPromise;
    const rc = await tx.wait();
    push(label, rc.gasUsed);
    return rc;
  }

  function eventArg(receipt, eventName, argName) {
    const log = receipt.logs.find((l) => l.fragment && l.fragment.name === eventName);
    if (!log) throw new Error(`Event not found: ${eventName}`);
    return log.args[argName];
  }

  async function increaseDays(days) {
    await network.provider.send("evm_increaseTime", [days * DAY + 1]);
    await network.provider.send("evm_mine");
  }

  // -----------------------------
  // Deploy local protocol
  // -----------------------------
  const INITIAL_NOMINAL = ethers.parseEther("100");
  const INITIAL_XEN_BURN = ethers.parseEther("10");

  const MockXEN = await ethers.getContractFactory("MockXEN");
  const xen = await MockXEN.deploy();
  await xen.waitForDeployment();

  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const core = await Core.deploy(
    ...coreConstructorArgs(
      await xen.getAddress(),
      INITIAL_NOMINAL,
      INITIAL_XEN_BURN,
      ETHEREUM_PROTOCOL_PROFILE
    )
  );
  await core.waitForDeployment();

  const XNTD = await ethers.getContractFactory("XNTDToken");
  const xntd = await XNTD.deploy(await core.getAddress());
  await xntd.waitForDeployment();

  const Stake = await ethers.getContractFactory("xEnchantedStake");
  const stake = await Stake.deploy(
    ...stakeConstructorArgs(await core.getAddress(), ETHEREUM_PROTOCOL_PROFILE)
  );
  await stake.waitForDeployment();

  const Forge = await ethers.getContractFactory("xEnchantedForge");
  const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());
  await forge.waitForDeployment();

  const Market = await ethers.getContractFactory("XenchantedMarket");
  const market = await Market.deploy(await core.getAddress());
  await market.waitForDeployment();
  const marketDeployTx = market.deploymentTransaction();
  if (!marketDeployTx) throw new Error("Market deployment transaction not found");
  const marketDeployRc = await marketDeployTx.wait();
  push("Market deploy", marketDeployRc.gasUsed);

  const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
  const tokenUriLens = await TokenURILens.deploy(await core.getAddress());
  await tokenUriLens.waitForDeployment();

  const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
  const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
  await stakeTokenUriLens.waitForDeployment();

  await (await core.setTokenURILens(await tokenUriLens.getAddress())).wait();
  await (await stake.setTokenURILens(await stakeTokenUriLens.getAddress())).wait();
  await (await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress())).wait();

  console.log("\n=== Gas Profile Setup ===");
  console.log("High level target:", HIGH_LEVEL);
  console.log("Initial nominal:", ethers.formatEther(INITIAL_NOMINAL), "XNTD");
  console.log("Initial XEN burn:", ethers.formatEther(INITIAL_XEN_BURN), "MockXEN");
  console.log("Setup transactions are not included in the measured rows unless explicitly listed.\n");

  // Large local MockXEN balances and allowance for setup flows.
  await (await xen.faucet(alice.address, ethers.parseEther("1000000000"))).wait();
  await (await xen.connect(alice).approve(await core.getAddress(), ethers.MaxUint256)).wait();

  async function mintL1(who = alice) {
    const tx = await core.connect(who).mintWithXEN();
    const rc = await tx.wait();
    return eventArg(rc, "Minted", "id");
  }

  async function mintL1Measured(label, who = alice) {
    const rc = await measure(label, core.connect(who).mintWithXEN());
    return eventArg(rc, "Minted", "id");
  }

  async function enchant(id1, id2, who = alice) {
    const tx = await core.connect(who).enchant(id1, id2);
    const rc = await tx.wait();
    return eventArg(rc, "Enchanted", "id");
  }

  async function enchantMeasured(label, id1, id2, who = alice) {
    const rc = await measure(label, core.connect(who).enchant(id1, id2));
    return eventArg(rc, "Enchanted", "id");
  }

  async function buildCoreLevel(level) {
    if (level === 1) return mintL1(alice);
    const a = await buildCoreLevel(level - 1);
    const b = await buildCoreLevel(level - 1);
    return enchant(a, b, alice);
  }

  async function fundXntd(targetAmount) {
    while ((await xntd.balanceOf(alice.address)) < targetAmount) {
      const id = await mintL1(alice);
      await (await core.connect(alice).redeem(id)).wait();
    }
  }

  async function forgeUnmeasured(amount) {
    await fundXntd(amount);
    const baseId = await mintL1(alice);
    const forgedId = await forge.connect(alice).forge.staticCall(baseId, amount);
    await (await forge.connect(alice).forge(baseId, amount)).wait();
    return forgedId;
  }

  async function forgeMeasured(label, amount) {
    await fundXntd(amount);
    const baseId = await mintL1(alice);
    const forgedId = await forge.connect(alice).forge.staticCall(baseId, amount);
    await measure(label, forge.connect(alice).forge(baseId, amount));
    return forgedId;
  }

  async function stakeMeasured(label, tokenId, durationDays = 30) {
    await (await core.connect(alice).approve(await stake.getAddress(), tokenId)).wait();
    await measure(label, stake.connect(alice).stake(tokenId, durationDays));
  }

  async function redeemStakeMeasured(label, tokenId) {
    await increaseDays(30);
    await measure(label, stake.connect(alice).redeem(tokenId));
  }

  async function marketListMeasured(label, tokenId, priceWei, seller = alice) {
    await (await core.connect(seller).approve(await market.getAddress(), tokenId)).wait();
    const rc = await measure(label, market.connect(seller).list(tokenId, priceWei));
    return eventArg(rc, "Listed", "listingId");
  }

  async function marketCancelMeasured(label, listingId, seller = alice) {
    await measure(label, market.connect(seller).cancel(listingId));
  }

  async function marketBuyMeasured(label, listingId, priceWei, buyer = bob) {
    await measure(label, market.connect(buyer).buy(listingId, { value: priceWei }));
  }

  async function marketWithdrawMeasured(label, seller = alice) {
    await measure(label, market.connect(seller).withdrawProceeds());
  }

  async function marketWithdrawForMeasured(label, seller = alice, caller = bob) {
    await measure(label, market.connect(caller).withdrawProceedsFor(seller.address));
  }

  // -----------------------------
  // 1) mintWithXEN baseline
  // -----------------------------
  await (await xen.faucet(bob.address, ethers.parseEther("1000"))).wait();

  await measure(
    "MockXEN approve Core for mintWithXEN",
    xen.connect(bob).approve(await core.getAddress(), await core.currentXenBurnAmount())
  );

  await mintL1Measured("Core mintWithXEN L1", bob);

  // -----------------------------
  // 2) enchant normal L1 -> L2
  // -----------------------------
  const l1a = await mintL1(alice);
  const l1b = await mintL1(alice);
  const coreL2 = await enchantMeasured("Enchant Core L1 + L1 -> L2", l1a, l1b, alice);

  // -----------------------------
  // 3) enchant high-level confirmation
  // -----------------------------
  console.log(`\nBuilding two Core L${HIGH_LEVEL} NFTs for high-level enchant confirmation...`);
  const highA = await buildCoreLevel(HIGH_LEVEL);
  const highB = await buildCoreLevel(HIGH_LEVEL);
  const highCore = await enchantMeasured(
    `Enchant Core L${HIGH_LEVEL} + L${HIGH_LEVEL} -> L${HIGH_LEVEL + 1}`,
    highA,
    highB,
    alice
  );

  // -----------------------------
  // 4) forge min and high nominal
  // -----------------------------
  const minForge = await forge.minForgeAmount();
  await forgeMeasured("Forge min amount", minForge);

  const highForgeAmount = ethers.parseEther("10000");
  await forgeMeasured("Forge 10K XNTD nominal", highForgeAmount);

  // -----------------------------
  // 5) stake start / phoenix redeem normal and high-level
  // -----------------------------
  const stakeL2 = coreL2;
  await stakeMeasured("Stake start Core L2", stakeL2, 30);
  await redeemStakeMeasured("Stake matured redeem / Phoenix Core L2", stakeL2);

  await stakeMeasured(`Stake start Core L${HIGH_LEVEL + 1}`, highCore, 30);
  await redeemStakeMeasured(`Stake matured redeem / Phoenix Core L${HIGH_LEVEL + 1}`, highCore);

  // -----------------------------
  // 6) forged enchant sample
  // -----------------------------
  const forgedA = await forgeUnmeasured(minForge);
  const forgedB = await forgeUnmeasured(minForge);
  const forgedL2 = await enchantMeasured("Enchant Forged L1 + L1 -> L2", forgedA, forgedB, alice);

  // -----------------------------
  // 7) market escrow flows
  // -----------------------------
  const marketPrice = ethers.parseEther("0.25");

  const marketCancelToken = await mintL1(alice);
  const cancelListingId = await marketListMeasured("Market list Core L1", marketCancelToken, marketPrice, alice);
  await marketCancelMeasured("Market cancel Core L1 listing", cancelListingId, alice);

  const marketBuyToken = await mintL1(alice);
  const buyListingId = await marketListMeasured("Market list Core L1 for buy", marketBuyToken, marketPrice, alice);
  await marketBuyMeasured("Market buy Core L1", buyListingId, marketPrice, bob);
  await marketWithdrawMeasured("Market withdraw proceeds", alice);

  const marketWithdrawForToken = await mintL1(alice);
  const withdrawForListingId = await marketListMeasured(
    "Market list Core L1 for withdrawFor",
    marketWithdrawForToken,
    marketPrice,
    alice
  );
  await marketBuyMeasured("Market buy Core L1 for withdrawFor", withdrawForListingId, marketPrice, bob);
  await marketWithdrawForMeasured("Market withdraw proceeds for seller", alice, carol);

  const highListingId = await marketListMeasured(
    `Market list Core L${HIGH_LEVEL + 1}`,
    highCore,
    marketPrice,
    alice
  );
  await marketCancelMeasured(`Market cancel Core L${HIGH_LEVEL + 1} listing`, highListingId, alice);

  const forgedListingId = await marketListMeasured("Market list Forged L2", forgedL2, marketPrice, alice);
  await marketCancelMeasured("Market cancel Forged L2 listing", forgedListingId, alice);

  // -----------------------------
  // Summary
  // -----------------------------
  console.log("\n=== Gas Profile Summary ===");
  console.log("| Flow | Gas Used |");
  console.log("| --- | ---: |");
  for (const row of rows) {
    console.log(`| ${row.label} | ${row.gas.toString()} |`);
  }

  console.log("\nNotes:");
  console.log("- Setup transactions are excluded unless explicitly listed as measured rows.");
  console.log("- Market deploy is included because Market is a new production contract in v1.");
  console.log("- High-level scenarios are confirmation cases for flat level/nominal gas behavior.");
  console.log("- Market list/cancel/buy/withdraw use fixed-size storage paths.");
  console.log("- _safeMint gas can vary for contract receivers via onERC721Received; this script uses EOAs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
