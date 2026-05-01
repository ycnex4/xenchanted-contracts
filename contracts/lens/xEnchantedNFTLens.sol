// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IxEnchantedNFTRead {
    struct NFTData {
        uint8   level;
        bool    isForged;
        uint64  createdAt;
        uint64  forgedAt;
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

    function baseAprBpsNow() external view returns (uint16);

    function ENCHANT_MULTIPLIER() external view returns (uint256);
    function MAX_LEVEL() external view returns (uint8);
    function BPS_DENOM() external view returns (uint256);
    function EARLY_PENALTY_BPS() external view returns (uint256);
    function MAX_WALLET_NFTS() external view returns (uint256);

    function previewEnchant(uint256 id1, uint256 id2)
        external
        view
        returns (
            bool ok,
            string memory reason,
            bool resultForged,
            uint8 resultLevel,
            uint256 resultNominal
        );

    function previewRedeem(uint256 id)
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

contract xEnchantedNFTLens {
    IxEnchantedNFTRead public immutable CORE;

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

    struct StakeAprPreview {
        bool exists;
        bool stakeable;
        uint16 baseAprBps;
        uint16 levelBonusBps;
        uint16 forgedBonusBps;
        uint16 totalAprBps;
    }

    constructor(address core) {
        require(core != address(0), "C0");
        CORE = IxEnchantedNFTRead(core);
    }

    // -------- Protocol params (Core truth) --------
    function getProtocolParams() external view returns (ProtocolParams memory p) {
        uint64 genesis = CORE.GENESIS_TS();
        uint256 interval = CORE.HALVING_INTERVAL();
        uint256 epoch = (block.timestamp - uint256(genesis)) / interval;
        if (epoch > 255) epoch = 255;

        return ProtocolParams({
            genesisTs: genesis,
            halvingInterval: interval,
            currentEpoch: epoch,
            nextHalvingTs: uint256(genesis) + ((epoch + 1) * interval),
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

    // -------- Trade info (one call) --------
    function getTradeInfo(uint256 id)
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

    function getTradeInfoStruct(uint256 id) external view returns (TradeInfo memory) {
        return _tradeInfo(id);
    }

    // -------- Redeem preview --------
    function previewRedeem(uint256 id)
        external
        view
        returns (bool exists, address owner, uint256 xntdOut)
    {
        (bool ownerOk, bytes memory ownerData) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        if (!ownerOk || ownerData.length == 0) return (false, address(0), 0);

        (bool exists_, , , , uint256 redeemAmount) = CORE.previewRedeem(id);
        if (!exists_) return (false, address(0), 0);

        owner = abi.decode(ownerData, (address));
        return (true, owner, redeemAmount);
    }

    // -------- Enchant preview (adapted from Core truth) --------
    function previewEnchant(uint256 id1, uint256 id2)
        external
        view
        returns (bool ok, uint8 newLevel, bool newIsForged, uint256 newNominal)
    {
        (ok, , newIsForged, newLevel, newNominal) = CORE.previewEnchant(id1, id2);
    }

    function previewEnchantDetailed(uint256 id1, uint256 id2)
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

    // -------- Stake APR preview (production staking rule: level >= 2) --------
    function previewStakeAPR(uint256 id)
        external
        view
        returns (bool exists, uint16 baseAprBpsNow_, uint16 aprBpsNow_)
    {
        StakeAprPreview memory p = previewStakeAPRBreakdown(id);
        return (p.exists && p.stakeable, p.baseAprBps, p.totalAprBps);
    }

    function previewStakeAPRBreakdown(uint256 id)
        public
        view
        returns (StakeAprPreview memory p)
    {
        if (!_exists(id)) return p;

        IxEnchantedNFTRead.NFTData memory d = CORE.nftData(id);
        p.exists = true;
        p.baseAprBps = CORE.baseAprBpsNow();

        if (d.level <= 1) {
            p.stakeable = false;
            return p;
        }

        p.stakeable = true;
        p.levelBonusBps = uint16(uint256(d.level - 1) * 100);
        p.forgedBonusBps = d.isForged ? 500 : 0;
        p.totalAprBps = p.baseAprBps + p.levelBonusBps + p.forgedBonusBps;
    }

    // -------- internal helpers --------
    function _tradeInfo(uint256 id) internal view returns (TradeInfo memory info) {
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

    function _exists(uint256 id) internal view returns (bool) {
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        return ok && data.length != 0;
    }
}
