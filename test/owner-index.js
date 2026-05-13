const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Owner index - Core and Stake inventory", function () {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const MockXEN = await ethers.getContractFactory("MockXEN");
    const xen = await MockXEN.deploy();

    const initialNominal = ethers.parseEther("100");
    const initialXenBurn = ethers.parseEther("10");
    const Core = await ethers.getContractFactory("xEnchantedNFT");
    const core = await Core.deploy(await xen.getAddress(), initialNominal, initialXenBurn);

    const XNTD = await ethers.getContractFactory("XNTDToken");
    const xntd = await XNTD.deploy(await core.getAddress());

    const Stake = await ethers.getContractFactory("xEnchantedStake");
    const stake = await Stake.deploy(await core.getAddress());

    const Forge = await ethers.getContractFactory("xEnchantedForge");
    const forge = await Forge.deploy(await core.getAddress(), await xntd.getAddress());

    const TokenURILens = await ethers.getContractFactory("xEnchantedTokenURILens");
    const tokenUriLens = await TokenURILens.deploy(await core.getAddress());
    await tokenUriLens.waitForDeployment();

    const StakeTokenURILens = await ethers.getContractFactory("xEnchantedStakeTokenURILens");
    const stakeTokenUriLens = await StakeTokenURILens.deploy(await stake.getAddress());
    await stakeTokenUriLens.waitForDeployment();

    await core.setTokenURILens(await tokenUriLens.getAddress());
    await stake.setTokenURILens(await stakeTokenUriLens.getAddress());

    await core.init(await xntd.getAddress(), await stake.getAddress(), await forge.getAddress());

    return { deployer, alice, bob, xen, core, xntd, stake, forge };
  }

  async function mintL1(env, who = env.alice) {
    const { xen, core } = env;
    await xen.faucet(who.address, ethers.parseEther("1000"));
    await xen.connect(who).approve(await core.getAddress(), await core.currentXenBurnAmount());
    const tx = await core.connect(who).mintWithXEN();
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Minted");
    return log.args.id;
  }

  async function enchant(env, id1, id2, who = env.alice) {
    const tx = await env.core.connect(who).enchant(id1, id2);
    const rc = await tx.wait();
    const log = rc.logs.find((l) => l.fragment && l.fragment.name === "Enchanted");
    return log.args.id;
  }

  async function makeCoreL2(env, who = env.alice) {
    const id1 = await mintL1(env, who);
    const id2 = await mintL1(env, who);
    return enchant(env, id1, id2, who);
  }

  async function fundXntd(env, targetAmount) {
    const { alice, xntd, core } = env;
    while ((await xntd.balanceOf(alice.address)) < targetAmount) {
      const id = await mintL1(env, alice);
      await core.connect(alice).redeem(id);
    }
  }

  async function expectTokenIds(contract, owner, expectedIds) {
    const actual = await contract.tokensOfOwner(owner.address);
    const legacy = await contract.walletOfOwner(owner.address);

    const normalize = (ids) => ids.map((x) => x.toString()).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

    expect(normalize(actual)).to.deep.equal(normalize(expectedIds));
    expect(normalize(legacy)).to.deep.equal(normalize(expectedIds));
    expect(await contract.ownerTokenCount(owner.address)).to.equal(BigInt(expectedIds.length));

    for (let i = 0; i < expectedIds.length; i++) {
      const byIndex = await contract.tokenOfOwnerByIndex(owner.address, i);
      expect(normalize(expectedIds)).to.include(byIndex.toString());
    }
  }

  it("Core index tracks mint, transfer and redeem", async function () {
    const env = await deploy();
    const { alice, bob, core } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    await expectTokenIds(core, alice, [id1, id2]);
    await expectTokenIds(core, bob, []);

    await core.connect(alice).transferFrom(alice.address, bob.address, id1);

    await expectTokenIds(core, alice, [id2]);
    await expectTokenIds(core, bob, [id1]);

    await core.connect(alice).redeem(id2);

    await expectTokenIds(core, alice, []);
    await expectTokenIds(core, bob, [id1]);
  });

  it("Core index tracks enchant burns and resulting mint", async function () {
    const env = await deploy();
    const { alice, core } = env;

    const id1 = await mintL1(env, alice);
    const id2 = await mintL1(env, alice);

    await expectTokenIds(core, alice, [id1, id2]);

    const l2Id = await enchant(env, id1, id2, alice);

    await expect(core.ownerOf(id1)).to.be.reverted;
    await expect(core.ownerOf(id2)).to.be.reverted;
    expect(await core.ownerOf(l2Id)).to.equal(alice.address);

    await expectTokenIds(core, alice, [l2Id]);
  });

  it("Core index tracks forge sacrifice and forged NFT mint", async function () {
    const env = await deploy();
    const { alice, core, xntd, forge } = env;

    const xntdAmount = await forge.minForgeAmount();
    await fundXntd(env, xntdAmount);

    const baseId = await mintL1(env, alice);
    await expectTokenIds(core, alice, [baseId]);

    const forgedId = await forge.connect(alice).forge.staticCall(baseId, xntdAmount);
    await xntd.connect(alice).approve(await forge.getAddress(), xntdAmount);
    await forge.connect(alice).forge(baseId, xntdAmount);

    await expect(core.ownerOf(baseId)).to.be.reverted;
    expect(await core.ownerOf(forgedId)).to.equal(alice.address);

    await expectTokenIds(core, alice, [forgedId]);
  });

  it("Core and Stake indexes move tokenId through stake and mature redeem", async function () {
    const env = await deploy();
    const { alice, core, stake } = env;

    const l2Id = await makeCoreL2(env, alice);

    await expectTokenIds(core, alice, [l2Id]);
    await expectTokenIds(stake, alice, []);

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    await expectTokenIds(core, alice, []);
    await expectTokenIds(stake, alice, [l2Id]);

    const pos = await stake.pos(l2Id);
    await time.increaseTo(BigInt(pos[2]) + 1n);

    await stake.connect(alice).redeem(l2Id);

    await expectTokenIds(stake, alice, []);
    await expectTokenIds(core, alice, [l2Id]);
  });

  it("Stake index follows Stake NFT transfer and redeem by current owner", async function () {
    const env = await deploy();
    const { alice, bob, core, stake } = env;

    const l2Id = await makeCoreL2(env, alice);

    await core.connect(alice).approve(await stake.getAddress(), l2Id);
    await stake.connect(alice).stake(l2Id, 30);

    await expectTokenIds(core, alice, []);
    await expectTokenIds(stake, alice, [l2Id]);
    await expectTokenIds(stake, bob, []);

    await stake.connect(alice).transferFrom(alice.address, bob.address, l2Id);

    await expectTokenIds(stake, alice, []);
    await expectTokenIds(stake, bob, [l2Id]);

    await stake.connect(bob).redeem(l2Id);

    await expectTokenIds(stake, bob, []);
    await expectTokenIds(core, bob, [l2Id]);
    await expectTokenIds(core, alice, []);
  });
});
