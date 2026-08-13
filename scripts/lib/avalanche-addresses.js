const AVALANCHE_ADDRESS_ENV_BY_NAME = Object.freeze({
  Core: "AVALANCHE_CORE_ADDRESS",
  XNTD: "AVALANCHE_XNTD_ADDRESS",
  Stake: "AVALANCHE_STAKE_ADDRESS",
  Forge: "AVALANCHE_FORGE_ADDRESS",
  Market: "AVALANCHE_MARKET_ADDRESS",
  NFTLens: "AVALANCHE_NFT_LENS_ADDRESS",
  TokenURILens: "AVALANCHE_TOKEN_URI_LENS_ADDRESS",
  StakeTokenURILens: "AVALANCHE_STAKE_TOKEN_URI_LENS_ADDRESS",
});

function readAvalancheAddresses(env = process.env) {
  return Object.fromEntries(
    Object.entries(AVALANCHE_ADDRESS_ENV_BY_NAME).map(([name, envName]) => [
      name,
      env[envName] || "",
    ])
  );
}

module.exports = {
  AVALANCHE_ADDRESS_ENV_BY_NAME,
  readAvalancheAddresses,
};
