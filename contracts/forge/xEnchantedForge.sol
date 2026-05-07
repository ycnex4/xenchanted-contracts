// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * xEnchantedForge manages Forged NFT creation for the xEnchanted Crypto protocol.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */

// TOKEN BURN INTERFACE

interface IXNTDForgeBurner {
    /**
     * @dev burns XNTD from a user through the protocol-bound Forge path
     */
    function burnForForge(address user, uint256 amount) external;
}

// CORE NFT FORGE HOOK INTERFACE

interface IxEnchantedNFTForgeHook {
    // INTERNAL TYPE TO DESCRIBE A CORE NFT SNAPSHOT
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

contract xEnchantedForge {
    // IMMUTABLE CONTRACT LINKS

    IxEnchantedNFTForgeHook public immutable CORE;
    IXNTDForgeBurner public immutable XNTD;

    // PUBLIC CONSTANTS

    uint16 public constant MIN_FORGE_MULTIPLIER = 5;
    uint16 public constant MAX_FORGE_MULTIPLIER = 1000;

    // PUBLIC TYPE TO DESCRIBE CURRENT FORGE PARAMETERS

    struct ForgeParams {
        uint256 currentBaseNominal;
        uint256 minForgeAmount;
        uint256 maxForgeAmount;
        uint16 minForgeMultiplier;
        uint16 maxForgeMultiplier;
    }

    // EVENTS

    /// @notice Full forge trace for indexers/frontends.
    event Forge(
        address indexed user,
        uint256 indexed baseId,
        uint256 indexed forgedId,
        uint256 currentBaseNominal,
        uint256 minForgeAmount,
        uint256 maxForgeAmount,
        uint256 xntdBurn,
        uint256 nominal
    );

    // CONSTRUCTOR

    constructor(address core, address xntd) {
        require(core != address(0), "C0");
        require(xntd != address(0), "T0");
        CORE = IxEnchantedNFTForgeHook(core);
        XNTD = IXNTDForgeBurner(xntd);
    }

    // PUBLIC STATE-CHANGING METHODS

    /**
     * @dev consumes a current-epoch Core L1 NFT, burns XNTD and mints a Forged NFT
     */
    function forge(uint256 baseId, uint256 xntdAmount) external returns (uint256 forgedId) {
        require(xntdAmount != 0, "Z");

        uint256 base = CORE.currentBaseNominal();
        uint256 minAmt = base * MIN_FORGE_MULTIPLIER;
        uint256 maxAmt = base * MAX_FORGE_MULTIPLIER;

        require(xntdAmount >= minAmt, "MIN");
        require(xntdAmount <= maxAmt, "MAX");

        // burn base Core L1 (Core validates owner + Core type + level == 1)
        CORE.burnL1ForForge(baseId, msg.sender);

        // burn XNTD from user through the bound Forge path.
        // No ERC20 approve/spending-cap transaction is required.
        XNTD.burnForForge(msg.sender, xntdAmount);

        // mint Forged NFT in Core
        // nominal == burned XNTD
        // xntdBurned provenance == burned XNTD
        forgedId = CORE.mintForgedFromXNTD(msg.sender, xntdAmount, xntdAmount);

        emit Forge(msg.sender, baseId, forgedId, base, minAmt, maxAmt, xntdAmount, xntdAmount);
        return forgedId;
    }

    // PUBLIC CONVENIENCE GETTERS

    /// @notice Minimum XNTD amount required to forge (current epoch base nominal * 5).
    function minForgeAmount() public view returns (uint256) {
        return CORE.currentBaseNominal() * MIN_FORGE_MULTIPLIER;
    }

    /// @notice Maximum XNTD amount allowed in a single forge (current epoch base nominal * 1000).
    function maxForgeAmount() public view returns (uint256) {
        return CORE.currentBaseNominal() * MAX_FORGE_MULTIPLIER;
    }

    /// @notice Frontend-friendly forge parameters.
    function getForgeParams() external view returns (ForgeParams memory p) {
        uint256 base = CORE.currentBaseNominal();
        p.currentBaseNominal = base;
        p.minForgeAmount = base * MIN_FORGE_MULTIPLIER;
        p.maxForgeAmount = base * MAX_FORGE_MULTIPLIER;
        p.minForgeMultiplier = MIN_FORGE_MULTIPLIER;
        p.maxForgeMultiplier = MAX_FORGE_MULTIPLIER;
    }

    /**
     * @dev validates a forge request and returns the resulting Forged NFT level and nominal
     */
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

        uint256 base = CORE.currentBaseNominal();
        uint256 minAmt = base * MIN_FORGE_MULTIPLIER;
        uint256 maxAmt = base * MAX_FORGE_MULTIPLIER;

        if (xntdAmount < minAmt) {
            return (false, "MIN", 0, 0);
        }

        if (xntdAmount > maxAmt) {
            return (false, "MAX", 0, 0);
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
