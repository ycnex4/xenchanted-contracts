// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * xEnchantedNFTLens provides read-only protocol views for Core and Forged NFTs.
 *
 * The lens does not own protocol state and does not change Core behavior.
 * Core remains the source of truth; this contract only aggregates data for
 * frontend, explorer, and integration readability.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */

/**
 * @dev minimal Core read interface used by this read-only lens
 */
interface IxEnchantedNFTRead {
    // INTERNAL TYPE TO READ CORE NFT DATA
    struct NFTData {
        uint8 level;
        bool isForged;
        uint64 createdAt;
        uint64 forgedAt;
        uint256 nominal;
        uint256 xenBurned;
        uint256 xntdBurned;
        uint256 parentId1;
        uint256 parentId2;
    }

    function nftData(uint256 id) external view returns (NFTData memory);

    function ownerOf(uint256 id) external view returns (address);

    function GENESIS_TS() external view returns (uint64);

    function HALVING_INTERVAL() external view returns (uint256);

    function INITIAL_NOMINAL() external view returns (uint256);

    function INITIAL_XEN_BURN() external view returns (uint256);

    function currentBaseNominal() external view returns (uint256);

    function currentXenBurnAmount() external view returns (uint256);

    function currentEpoch() external view returns (uint256);

    function nextHalvingTs() external view returns (uint256);

    function baseAprBpsNow() external view returns (uint16);

    function ENCHANT_MULTIPLIER() external view returns (uint256);

    function MAX_LEVEL() external view returns (uint8);

    function BPS_DENOM() external view returns (uint256);

    function EARLY_PENALTY_BPS() external view returns (uint256);

    function MAX_WALLET_NFTS() external view returns (uint256);

    function previewEnchant(
        uint256 id1,
        uint256 id2
    )
        external
        view
        returns (
            bool ok,
            string memory reason,
            bool resultForged,
            uint8 resultLevel,
            uint256 resultNominal
        );

    function previewRedeem(
        uint256 id
    )
        external
        view
        returns (
            bool exists_,
            bool isForged,
            uint8 level,
            uint256 nominal,
            uint256 redeemAmount
        );
}

interface IxEnchantedStakeRead {
    function previewStakeAPRBreakdown(
        uint256 id
    )
        external
        view
        returns (
            bool exists_,
            bool stakeable,
            uint16 baseAprBps,
            uint16 levelBonusBps,
            uint16 forgedBonusBps,
            uint16 totalAprBps
        );
}

contract xEnchantedNFTLens {
    // IMMUTABLE PROTOCOL LINKS
    IxEnchantedNFTRead public immutable CORE;
    IxEnchantedStakeRead public immutable STAKE;

    // PUBLIC VIEW TYPE TO DESCRIBE CORE OR FORGED NFT DATA
    struct TradeInfo {
        bool exists;
        address owner;
        uint8 level;
        bool isForged;
        uint256 nominal;
        uint64 createdAt;
        uint64 forgedAt;
        uint256 xenBurned;
        uint256 xntdBurned;
        uint256 parentId1;
        uint256 parentId2;
    }

    // PUBLIC VIEW TYPE TO DESCRIBE CURRENT PROTOCOL PARAMETERS
    struct ProtocolParams {
        uint64 genesisTs;
        uint256 halvingInterval;
        uint256 currentEpoch;
        uint256 nextHalvingTs;
        uint256 initialNominal;
        uint256 currentBaseNominal;
        uint256 initialXenBurn;
        uint256 currentXenBurnAmount;
        uint256 enchantMultiplier;
        uint8 maxLevel;
        uint16 baseAprBpsNow;
        uint256 bpsDenom;
        uint256 earlyPenaltyBps;
        uint256 maxWalletNfts;
    }

    // PUBLIC VIEW TYPE TO DESCRIBE CURRENT STAKE APR BREAKDOWN
    struct StakeAprPreview {
        bool exists;
        bool stakeable;
        uint16 baseAprBps;
        uint16 levelBonusBps;
        uint16 forgedBonusBps;
        uint16 totalAprBps;
    }

    // CONSTRUCTOR
    constructor(address core, address stake) {
        require(core != address(0), "C0");
        require(stake != address(0), "S0");
        require(core.code.length != 0, "C_CODE");
        require(stake.code.length != 0, "S_CODE");

        CORE = IxEnchantedNFTRead(core);
        STAKE = IxEnchantedStakeRead(stake);
    }

    // PUBLIC CONVENIENCE GETTERS

    /**
     * @dev returns current protocol parameters as read from Core
     */
    function getProtocolParams()
        external
        view
        returns (ProtocolParams memory p)
    {
        uint64 genesis = CORE.GENESIS_TS();
        uint256 interval = CORE.HALVING_INTERVAL();

        return
            ProtocolParams({
                genesisTs: genesis,
                halvingInterval: interval,
                currentEpoch: CORE.currentEpoch(),
                nextHalvingTs: CORE.nextHalvingTs(),
                initialNominal: CORE.INITIAL_NOMINAL(),
                currentBaseNominal: CORE.currentBaseNominal(),
                initialXenBurn: CORE.INITIAL_XEN_BURN(),
                currentXenBurnAmount: CORE.currentXenBurnAmount(),
                enchantMultiplier: CORE.ENCHANT_MULTIPLIER(),
                maxLevel: CORE.MAX_LEVEL(),
                baseAprBpsNow: CORE.baseAprBpsNow(),
                bpsDenom: CORE.BPS_DENOM(),
                earlyPenaltyBps: CORE.EARLY_PENALTY_BPS(),
                maxWalletNfts: CORE.MAX_WALLET_NFTS()
            });
    }

    /**
     * @dev returns Core or Forged NFT data and owner in one call
     */
    function getTradeInfo(
        uint256 id
    )
        external
        view
        returns (
            bool exists,
            address owner,
            uint8 level,
            bool isForged,
            uint256 nominal,
            uint64 createdAt,
            uint64 forgedAt,
            uint256 xenBurned,
            uint256 xntdBurned,
            uint256 parentId1,
            uint256 parentId2
        )
    {
        TradeInfo memory info = _tradeInfo(id);
        return (
            info.exists,
            info.owner,
            info.level,
            info.isForged,
            info.nominal,
            info.createdAt,
            info.forgedAt,
            info.xenBurned,
            info.xntdBurned,
            info.parentId1,
            info.parentId2
        );
    }

    /**
     * @dev returns Core or Forged NFT data as a struct for compact integrations
     */
    function getTradeInfoStruct(
        uint256 id
    ) external view returns (TradeInfo memory) {
        return _tradeInfo(id);
    }

    /**
     * @dev previews redeem output for an existing Core or Forged NFT
     */
    function previewRedeem(
        uint256 id
    ) external view returns (bool exists, address owner, uint256 xntdOut) {
        (bool ownerOk, bytes memory ownerData) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        if (!ownerOk || ownerData.length == 0) return (false, address(0), 0);

        (bool exists_, , , , uint256 redeemAmount) = CORE.previewRedeem(id);
        if (!exists_) return (false, address(0), 0);

        owner = abi.decode(ownerData, (address));
        return (true, owner, redeemAmount);
    }

    /**
     * @dev previews the next NFT level and nominal produced by enchant
     */
    function previewEnchant(
        uint256 id1,
        uint256 id2
    )
        external
        view
        returns (bool ok, uint8 newLevel, bool newIsForged, uint256 newNominal)
    {
        (ok, , newIsForged, newLevel, newNominal) = CORE.previewEnchant(
            id1,
            id2
        );
    }

    /**
     * @dev previews enchant and returns the Core reason string for failed checks
     */
    function previewEnchantDetailed(
        uint256 id1,
        uint256 id2
    )
        external
        view
        returns (
            bool ok,
            string memory reason,
            bool resultForged,
            uint8 resultLevel,
            uint256 resultNominal
        )
    {
        return CORE.previewEnchant(id1, id2);
    }

    /**
     * @dev returns the current base APR and total APR for a stakeable NFT
     */
    function previewStakeAPR(
        uint256 id
    )
        external
        view
        returns (bool exists, uint16 baseAprBpsNow_, uint16 aprBpsNow_)
    {
        StakeAprPreview memory p = previewStakeAPRBreakdown(id);
        return (p.exists && p.stakeable, p.baseAprBps, p.totalAprBps);
    }

    /**
     * @dev returns current stake APR breakdown using Core protocol rules
     */
    function previewStakeAPRBreakdown(
        uint256 id
    ) public view returns (StakeAprPreview memory p) {
        (
            p.exists,
            p.stakeable,
            p.baseAprBps,
            p.levelBonusBps,
            p.forgedBonusBps,
            p.totalAprBps
        ) = STAKE.previewStakeAPRBreakdown(id);
    }

    // INTERNAL HELPERS

    /**
     * @dev reads owner and NFT data without reverting when the token does not exist
     */
    function _tradeInfo(
        uint256 id
    ) internal view returns (TradeInfo memory info) {
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        if (!ok || data.length == 0) return info;

        info.exists = true;
        info.owner = abi.decode(data, (address));

        IxEnchantedNFTRead.NFTData memory d = CORE.nftData(id);
        info.level = d.level;
        info.isForged = d.isForged;
        info.nominal = d.nominal;
        info.createdAt = d.createdAt;
        info.forgedAt = d.forgedAt;
        info.xenBurned = d.xenBurned;
        info.xntdBurned = d.xntdBurned;
        info.parentId1 = d.parentId1;
        info.parentId2 = d.parentId2;
    }

    /**
     * @dev checks token existence through Core ownerOf without bubbling reverts
     */
    function _exists(uint256 id) internal view returns (bool) {
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        return ok && data.length != 0;
    }
}
