// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../core/xEnchantedNFT.sol";

interface IxEnchantedNFTRead {
    struct NFTData {
        uint8   level;
        bool    isForged;
        uint64  createdAt;
        uint64  forgedAt;
        uint256 nominal;
        uint256 xenBurned;
        uint256 parentId1;
        uint256 parentId2;
    }

    function nftData(uint256 id) external view returns (NFTData memory);

    function ownerOf(uint256 id) external view returns (address);

    function baseAprBpsNow() external view returns (uint16);

    function ENCHANT_MULTIPLIER() external view returns (uint256);
    function MAX_LEVEL() external view returns (uint8);
}

contract xEnchantedNFTLens {
    IxEnchantedNFTRead public immutable CORE;

    constructor(address core) {
        require(core != address(0), "C0");
        CORE = IxEnchantedNFTRead(core);
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
            uint256 parentId1,
            uint256 parentId2
        )
    {
        // ownerOf reverts if token doesn't exist -> catch by low-level
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        if (!ok || data.length == 0) {
            return (false, address(0), 0, false, 0, 0, 0, 0, 0);
        }

        owner = abi.decode(data, (address));
        IxEnchantedNFTRead.NFTData memory d = CORE.nftData(id);

        return (
            true,
            owner,
            d.level,
            d.isForged,
            d.nominal,
            d.createdAt,
            d.forgedAt,
            d.parentId1,
            d.parentId2
        );
    }

    // -------- Redeem preview --------
    function previewRedeem(uint256 id)
        external
        view
        returns (bool exists, address owner, uint256 xntdOut)
    {
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        if (!ok || data.length == 0) return (false, address(0), 0);

        owner = abi.decode(data, (address));
        xntdOut = CORE.nftData(id).nominal;
        return (true, owner, xntdOut);
    }

    // -------- Enchant preview --------
    function previewEnchant(uint256 id1, uint256 id2)
        external
        view
        returns (bool ok, uint8 newLevel, bool newIsForged, uint256 newNominal)
    {
        if (id1 == id2) return (false, 0, false, 0);

        // ensure both exist (ownerOf reverts if not)
        if (!_exists(id1) || !_exists(id2)) return (false, 0, false, 0);

        IxEnchantedNFTRead.NFTData memory a = CORE.nftData(id1);
        IxEnchantedNFTRead.NFTData memory b = CORE.nftData(id2);

        uint8 maxLevel = CORE.MAX_LEVEL();

        if (a.level == 0 || b.level == 0) return (false, 0, false, 0);
        if (a.level != b.level) return (false, 0, false, 0);
        if (a.level >= maxLevel) return (false, 0, false, 0);

        newLevel = a.level + 1;

        if (a.isForged && b.isForged) {
            // fNFT + fNFT => forged, 1:1
            return (true, newLevel, true, a.nominal + b.nominal);
        }

        if (!a.isForged && !b.isForged) {
            // ordinary + ordinary => avg*3
            uint256 avg = (a.nominal + b.nominal) / 2;
            uint256 mult = CORE.ENCHANT_MULTIPLIER();
            return (true, newLevel, false, avg * mult);
        }

        // mixed => ordinary
        return (true, newLevel, false, (a.nominal + b.nominal) / 2);
    }

    // -------- Stake APR preview (if staked now) --------
    function previewStakeAPR(uint256 id)
        external
        view
        returns (bool exists, uint16 baseAprBpsNow_, uint16 aprBpsNow_)
    {
        if (!_exists(id)) return (false, 0, 0);

        IxEnchantedNFTRead.NFTData memory d = CORE.nftData(id);

        baseAprBpsNow_ = CORE.baseAprBpsNow();

        uint256 levelBonusBps = 0;
        if (d.level > 1) levelBonusBps = uint256(d.level - 1) * 100;

        uint256 apr = uint256(baseAprBpsNow_) + levelBonusBps;

        if (d.isForged && d.level > 1) apr += 500;

        aprBpsNow_ = uint16(apr);
        return (true, baseAprBpsNow_, aprBpsNow_);
    }

    // -------- internal existence check (ownerOf may revert) --------
    function _exists(uint256 id) internal view returns (bool) {
        (bool ok, bytes memory data) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
        );
        return ok && data.length != 0;
    }
}