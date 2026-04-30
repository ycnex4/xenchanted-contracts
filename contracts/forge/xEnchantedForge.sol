// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20BurnFrom {
    function burnFrom(address account, uint256 amount) external;
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IxEnchantedNFTForgeHook {
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

    function currentBaseNominal() external view returns (uint256);

    function exists(uint256 id) external view returns (bool);

    function ownerOf(uint256 id) external view returns (address);

    function nftData(uint256 id) external view returns (
        uint8 level,
        bool isForged,
        uint64 createdAt,
        uint64 forgedAt,
        uint256 nominal,
        uint256 xenBurned,
        uint256 xntdBurned,
        uint256 parentId1,
        uint256 parentId2
    );

    function burnL1ForForge(uint256 baseId, address ownerExpected)
        external
        returns (NFTData memory snap);

    function mintForgedFromXNTD(address to, uint256 nom, uint256 xntdTotalBurned)
        external
        returns (uint256 id);
}

/**
 * xEnchantedForge
 * - Minimal forge amount is tied to Core current epoch base nominal.
 * - Requires burning: 1 base L1 + XNTD.
 * - Mints forged NFT with nominal == XNTD burned.
 * - Tracks provenance: XNTD_TOTAL_BURNED == XNTD burned.
 */
contract xEnchantedForge {
    IxEnchantedNFTForgeHook public immutable CORE;
    IERC20BurnFrom public immutable XNTD;

    /// @notice Full forge trace for indexers/frontends.
    event Forge(
        address indexed user,
        uint256 indexed baseId,
        uint256 indexed forgedId,
        uint256 minEpochNominal,
        uint256 xntdBurn
    );

    constructor(address core, address xntd) {
        require(core != address(0), "C0");
        require(xntd != address(0), "T0");
        CORE = IxEnchantedNFTForgeHook(core);
        XNTD = IERC20BurnFrom(xntd);
    }

    function forge(uint256 baseId, uint256 xntdAmount) external returns (uint256 forgedId) {
        require(xntdAmount != 0, "Z");
        require(XNTD.allowance(msg.sender, address(this)) >= xntdAmount, "ALLOW");

        uint256 minAmt = CORE.currentBaseNominal();
        require(xntdAmount >= minAmt, "MIN");

        // burn base L1 (Core validates owner + level==1)
        CORE.burnL1ForForge(baseId, msg.sender);

        // burn XNTD from user (requires allowance)
        XNTD.burnFrom(msg.sender, xntdAmount);

        // mint forged NFT in Core
        // nominal == burned XNTD
        // xntdBurned provenance == burned XNTD
        forgedId = CORE.mintForgedFromXNTD(msg.sender, xntdAmount, xntdAmount);

        emit Forge(msg.sender, baseId, forgedId, minAmt, xntdAmount);
        return forgedId;
    }

    /// @notice Minimum XNTD amount required to forge (tied to Core current epoch nominal).
    function minForgeAmount() external view returns (uint256) {
        return CORE.currentBaseNominal();
    }

    function previewForge(uint256 baseId, uint256 xntdAmount, address user)
        external
        view
        returns (
            bool ok,
            string memory reason,
            uint8 resultLevel,
            uint256 resultNominal
        )
    {
        if (user == address(0)) {
            return (false, "USR0", 0, 0);
        }

        if (xntdAmount == 0) {
            return (false, "AMT0", 0, 0);
        }

        uint256 minAmt = CORE.currentBaseNominal();
        if (xntdAmount < minAmt) {
            return (false, "MIN", 0, 0);
        }

        if (!CORE.exists(baseId)) {
            return (false, "NO_NFT", 0, 0);
        }

        if (CORE.ownerOf(baseId) != user) {
            return (false, "OWN", 0, 0);
        }

        (
            uint8 level,
            bool isForged,
            uint64 createdAt,
            uint64 forgedAt,
            uint256 nominal,
            uint256 xenBurned,
            uint256 xntdBurned,
            uint256 parentId1,
            uint256 parentId2
        ) = CORE.nftData(baseId);

        createdAt;
        forgedAt;
        nominal;
        xenBurned;
        xntdBurned;
        parentId1;
        parentId2;

        if (isForged) {
            return (false, "F1", 0, 0);
        }

        if (level != 1) {
            return (false, "L1", 0, 0);
        }

        return (true, "", 1, xntdAmount);
    }
}