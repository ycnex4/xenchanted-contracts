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
 * - whale burn target splitting under different Forge caps.
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

function printNotes() {
  console.log("## Notes");
  console.log("");
  console.log("- This script is a discussion aid, not a protocol change.");
  console.log("- Current implemented baseline remains min = base * 5 and max = base * 1000.");
  console.log("- A lower max cap increases the number of transactions needed for large burns.");
  console.log("- A higher max cap strengthens one-act burn capacity but allows more one-act concentration.");
  console.log("- The key tradeoff is XNTD sink strength vs. Forged NFT nominal distribution.");
  console.log("- Further modeling can add assumptions about user cohorts, XNTD price, stake APR, and epoch timing.");
  console.log("");
}

function main() {
  console.log("## Generated Forge-Cap Tables");
  console.log("");
  console.log("Preliminary Forge-cap tables for discussion.");
  console.log("");

  printEpochForgeBoundsTable();

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
