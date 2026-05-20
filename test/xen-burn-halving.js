const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 24 * 60 * 60;
const PROTOCOL_HALVING = 180 * DAY;
const XEN_BURN_HALVING = 360 * DAY;

async function deployFixture() {
  const MockXEN = await ethers.getContractFactory("MockXEN");
  const xen = await MockXEN.deploy();
  await xen.waitForDeployment();

  const initialNominal = ethers.parseEther("100");
  const initialXenBurn = ethers.parseEther("100000000");

  const Core = await ethers.getContractFactory("xEnchantedNFT");
  const core = await Core.deploy(
    await xen.getAddress(),
    initialNominal,
    initialXenBurn
  );
  await core.waitForDeployment();

  return { core, initialNominal, initialXenBurn };
}

async function setNextBlockTimestamp(ts) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
  await network.provider.send("evm_mine");
}

describe("XEN burn halving interval", function () {
  it("uses 360 days for XEN burn while protocol halving remains 180 days", async function () {
    const { core, initialNominal, initialXenBurn } = await deployFixture();

    const genesisTs = await core.GENESIS_TS();

    expect(await core.HALVING_INTERVAL()).to.equal(BigInt(PROTOCOL_HALVING));
    expect(await core.XEN_BURN_HALVING_INTERVAL()).to.equal(BigInt(XEN_BURN_HALVING));

    expect(await core.currentBaseNominal()).to.equal(initialNominal);
    expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn);

    await setNextBlockTimestamp(genesisTs + BigInt(PROTOCOL_HALVING));

    expect(await core.currentBaseNominal()).to.equal(initialNominal / 2n);
    expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn);

    await setNextBlockTimestamp(genesisTs + BigInt(XEN_BURN_HALVING));

    expect(await core.currentBaseNominal()).to.equal(initialNominal / 4n);
    expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn / 2n);

    await setNextBlockTimestamp(genesisTs + BigInt(2 * XEN_BURN_HALVING));

    expect(await core.currentBaseNominal()).to.equal(initialNominal / 16n);
    expect(await core.currentXenBurnAmount()).to.equal(initialXenBurn / 4n);
  });
});
