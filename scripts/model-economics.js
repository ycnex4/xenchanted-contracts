/**
 * xEnchanted Crypto - numerical economics model
 *
 * This script prints preliminary markdown tables for protocol economics discussion.
 *
 * It does not connect to chain.
 * It does not read .env.
 * It does not change contracts.
 *
 * Current focus:
 * - epoch base nominal decay;
 * - Forge min/max bounds;
 * - whale burn target splitting under different Forge caps;
 * - XNTD availability constraints before large Forge activity.
 */

const EPOCHS_TO_SHOW = 12;

// Current documented baseline:
// Epoch 0 base nominal: 100 XNTD
// Halving interval: 180 days
// Each epoch halves the base nominal.
const GENESIS_BASE_NOMINAL = 100;

// Current Forge baseline:
const FORGE_MIN_MULTIPLIER = 5;
const CURRENT_FORGE_MAX_MULTIPLIER = 1000;

// Alternative max caps for discussion:
const FORGE_CAP_SCENARIOS = [100, 500, 1000];

// Burn targets are expressed in XNTD nominal.
// These are discussion examples, not recommendations.
// The same targets are also used to estimate XNTD availability requirements.
const WHALE_BURN_TARGETS = [
  1_000,
  5_000,
  10_000,
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
];

function fmt(value, digits = 6) {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function baseNominalAtEpoch(epoch) {
  return GENESIS_BASE_NOMINAL / 2 ** epoch;
}

function forgeMin(baseNominal) {
  return baseNominal * FORGE_MIN_MULTIPLIER;
}

function forgeMax(baseNominal, capMultiplier) {
  return baseNominal * capMultiplier;
}

function actsNeeded(target, maxPerAct) {
  return Math.ceil(target / maxPerAct);
}

function printEpochForgeBoundsTable() {
  console.log("## Forge Bounds By Epoch");
  console.log("");
  console.log("This table shows Forge min/max bounds under different max-cap scenarios.");
  console.log("");
  console.log("| Epoch | Base Nominal | Min 5x | Max 100x | Max 500x | Max 1000x |");
  console.log("| ---: | ---: | ---: | ---: | ---: | ---: |");

  for (let epoch = 0; epoch <= EPOCHS_TO_SHOW; epoch++) {
    const base = baseNominalAtEpoch(epoch);

    console.log(
      `| ${epoch} | ${fmt(base)} | ${fmt(forgeMin(base))} | ${fmt(
        forgeMax(base, 100)
      )} | ${fmt(forgeMax(base, 500))} | ${fmt(forgeMax(base, 1000))} |`
    );
  }

  console.log("");
}

function printXntdAvailabilityTable() {
  console.log("## XNTD Availability Constraint");
  console.log("");
  console.log("A high Forge cap does not mean that high-nominal Forged NFTs can appear immediately.");
  console.log("");
  console.log("The user must first obtain XNTD from protocol activity or from the market. In early epochs, the dominant liquid XNTD source is likely Core/Forged NFT redemption rather than staking rewards.");
  console.log("");
  console.log("This table estimates how many simple Core L1 redemptions would be needed to create each XNTD target, assuming no secondary market aggregation and no higher-level redeem path.");
  console.log("");
  console.log("Important limitation: this table does not account for enchant paths. Higher-level NFT redemption can produce more XNTD per redeem, but requires prior mint/enchant activity and parent NFT burns.");
  console.log("");
  console.log("| Target XNTD | Core L1 Redemptions @ Epoch 0 | Core L1 Redemptions @ Epoch 1 | Core L1 Redemptions @ Epoch 3 |");
  console.log("| ---: | ---: | ---: | ---: |");

  const epochs = [0, 1, 3];

  for (const target of WHALE_BURN_TARGETS) {
    const redemptions = epochs.map((epoch) => {
      const base = baseNominalAtEpoch(epoch);
      return Math.ceil(target / base);
    });

    console.log(
      `| ${fmt(target)} | ${fmt(redemptions[0])} | ${fmt(redemptions[1])} | ${fmt(redemptions[2])} |`
    );
  }

  console.log("");
  console.log("Interpretation:");
  console.log("");
  console.log("- In Epoch 0, a 100,000 XNTD Forge requires roughly the liquid supply of 1,000 redeemed Core L1 NFTs if sourced only through simple L1 redemption.");
  console.log("- In Epoch 3, the same 100,000 XNTD target would require roughly 8,000 simple Core L1 redemptions at the lower base nominal.");
  console.log("- Therefore, Forge cap should be evaluated together with XNTD availability, not as an isolated maximum.");
  console.log("- The redemption counts above are simple Core L1 equivalents, not a full model of enchanted NFT production.");
  console.log("");
}

function printPerActCapTable(epoch) {
  const base = baseNominalAtEpoch(epoch);

  console.log(`## Per-Act Forge Cap Comparison - Epoch ${epoch}`);
  console.log("");
  console.log(`Base nominal: ${fmt(base)} XNTD`);
  console.log("");
  console.log("| Cap Scenario | Max Per Forge Act | Relative To Current 1000x |");
  console.log("| --- | ---: | ---: |");

  const currentMax = forgeMax(base, CURRENT_FORGE_MAX_MULTIPLIER);

  for (const cap of FORGE_CAP_SCENARIOS) {
    const max = forgeMax(base, cap);
    const relative = max / currentMax;

    console.log(`| ${cap}x | ${fmt(max)} XNTD | ${fmt(relative * 100, 2)}% |`);
  }

  console.log("");
}

function printWhaleSplitTable(epoch) {
  const base = baseNominalAtEpoch(epoch);

  console.log(`## Whale Burn Target Split - Epoch ${epoch}`);
  console.log("");
  console.log(`Base nominal: ${fmt(base)} XNTD`);
  console.log("");
  console.log(
    "| Target XNTD Burn | Acts @ 100x cap | Acts @ 500x cap | Acts @ 1000x cap |"
  );
  console.log("| ---: | ---: | ---: | ---: |");

  for (const target of WHALE_BURN_TARGETS) {
    const row = FORGE_CAP_SCENARIOS.map((cap) =>
      actsNeeded(target, forgeMax(base, cap))
    );

    console.log(`| ${fmt(target)} | ${fmt(row[0])} | ${fmt(row[1])} | ${fmt(row[2])} |`);
  }

  console.log("");
}

function printNotes() {
  console.log("## Notes");
  console.log("");
  console.log("- This script is a discussion aid, not a protocol change.");
  console.log("- Current implemented baseline remains min = base * 5 and max = base * 1000.");
  console.log("- A lower max cap increases the number of transactions needed for large burns.");
  console.log("- A higher max cap strengthens one-act burn capacity but allows more one-act concentration.");
  console.log("- A high cap does not create XNTD supply by itself; XNTD must first be produced through protocol actions or acquired from other participants.");
  console.log("- The key tradeoff is XNTD sink strength vs. Forged NFT nominal distribution, constrained by actual XNTD availability.");
  console.log("- Further modeling can add assumptions about user cohorts, XNTD price, stake APR, and epoch timing.");
  console.log("");
}

function main() {
  console.log("## Generated Forge-Cap Tables");
  console.log("");
  console.log("Preliminary Forge-cap tables for discussion.");
  console.log("");

  printEpochForgeBoundsTable();
  printXntdAvailabilityTable();

  // Current epoch focus
  printPerActCapTable(0);
  printWhaleSplitTable(0);

  // Future epoch examples
  printPerActCapTable(1);
  printWhaleSplitTable(1);

  printPerActCapTable(3);
  printWhaleSplitTable(3);

  printNotes();
}

main();
