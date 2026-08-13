const DAY_SECONDS = 24 * 60 * 60;

const ETHEREUM_PROTOCOL_PROFILE = Object.freeze({
  name: "ethereum",
  halvingIntervalSeconds: 180 * DAY_SECONDS,
  xenBurnHalvingIntervalSeconds: 360 * DAY_SECONDS,
  minStakeDays: 30,
  maxStakeDays: 730,
});

const AVALANCHE_PROTOCOL_PROFILE = Object.freeze({
  name: "avalanche",
  halvingIntervalSeconds: 60 * DAY_SECONDS,
  xenBurnHalvingIntervalSeconds: 120 * DAY_SECONDS,
  minStakeDays: 10,
  maxStakeDays: 240,
});

function validateProtocolProfile(profile) {
  const integerFields = [
    "halvingIntervalSeconds",
    "xenBurnHalvingIntervalSeconds",
    "minStakeDays",
    "maxStakeDays",
  ];

  for (const field of integerFields) {
    if (!Number.isSafeInteger(profile[field]) || profile[field] <= 0) {
      throw new Error(`Invalid ${profile.name} protocol profile field ${field}`);
    }
  }

  if (profile.maxStakeDays < profile.minStakeDays) {
    throw new Error(`Invalid ${profile.name} stake duration range`);
  }

  if (profile.minStakeDays > 0xffff || profile.maxStakeDays > 0xffff) {
    throw new Error(`Invalid ${profile.name} uint16 stake duration`);
  }

  if (
    profile.xenBurnHalvingIntervalSeconds < profile.halvingIntervalSeconds
  ) {
    throw new Error(`Invalid ${profile.name} XEN burn halving interval`);
  }

  if (profile.maxStakeDays * DAY_SECONDS > 0xffffffff) {
    throw new Error(`Invalid ${profile.name} uint32 stake duration`);
  }

  return profile;
}

validateProtocolProfile(ETHEREUM_PROTOCOL_PROFILE);
validateProtocolProfile(AVALANCHE_PROTOCOL_PROFILE);

function coreConstructorArgs(xen, initialNominal, initialXenBurn, profile) {
  validateProtocolProfile(profile);
  return [
    xen,
    initialNominal,
    initialXenBurn,
    profile.halvingIntervalSeconds,
    profile.xenBurnHalvingIntervalSeconds,
  ];
}

function stakeConstructorArgs(core, profile) {
  validateProtocolProfile(profile);
  return [core, profile.minStakeDays, profile.maxStakeDays];
}

module.exports = {
  DAY_SECONDS,
  ETHEREUM_PROTOCOL_PROFILE,
  AVALANCHE_PROTOCOL_PROFILE,
  validateProtocolProfile,
  coreConstructorArgs,
  stakeConstructorArgs,
};
