function requireReviewedSourceCommit(actualCommit, expectedCommit) {
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit || "")) {
    throw new Error(
      "AVALANCHE_SOURCE_COMMIT must be the full 40-character reviewed commit SHA"
    );
  }

  if (actualCommit.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(
      `Refusing to deploy unreviewed source: HEAD=${actualCommit}, ` +
        `AVALANCHE_SOURCE_COMMIT=${expectedCommit}`
    );
  }
}

module.exports = { requireReviewedSourceCommit };
