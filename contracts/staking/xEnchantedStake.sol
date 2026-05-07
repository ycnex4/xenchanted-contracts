// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IxEnchantedNFT {
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

    function baseAprBpsNow() external view returns (uint16);

    function burnForStaking(uint256 id, address ownerExpected)
        external
        returns (NFTData memory snap);

    function redeemStakedAndPhoenixMint(
        address to,
        uint256 id,
        NFTData calldata snap,
        uint32 startTs,
        uint32 endTs,
        uint16 baseAprBpsAtStake
    ) external;

    function nextId() external view returns (uint256);
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
}

interface IStakeTokenURILens {
    function tokenURI(uint256 id) external view returns (string memory);
}

/**
 * xEnchantedStake manages tradable Stake NFTs for the xEnchanted Crypto protocol.
 *
 * A Stake NFT represents a locked Core or Forged NFT position. The staked NFT
 * is burned in Core at stake start, while this contract stores its snapshot and
 * mints a transferable Stake NFT with the same tokenId. On redeem, Core restores
 * the Core or Forged NFT through the Phoenix flow and mints rewards only when
 * the position is mature.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */
contract xEnchantedStake is ERC721, ReentrancyGuard {
    // IMMUTABLE PROTOCOL LINK
    IxEnchantedNFT public immutable CORE;
    address public DEPLOYER;
    address public TOKEN_URI_LENS;

    // INTERNAL TYPES

    struct Pos {
        IxEnchantedNFT.NFTData snap;
        uint32 startTs;
        uint32 endTs;
        uint16 baseAprBps;
        bool active;
    }

    struct StakeView {
        uint256 tokenId;
        address owner;
        bool isForged;
        uint8 level;
        uint256 nominal;
        uint32 startTs;
        uint32 endTs;
        uint16 durationDays;
        bool active;
        bool matured;
        uint16 baseAprBps;
        uint16 levelBonusBps;
        uint16 forgedBonusBps;
        uint16 totalAprBps;
        uint256 expectedReward;
        uint256 availableReward;
        uint256 earlyRedeemNominal;
        uint256 maturityRedeemNominal;
    }

    // PUBLIC STATE, READABLE VIA NAMESAKE GETTERS

    mapping(uint256 => Pos) public pos;

    // PUBLIC CONSTANTS

    uint16 public constant MIN_DAYS = 30;
    uint16 public constant MAX_DAYS = 730;

    uint256 public constant BPS_DENOM = 10_000;
    uint16 public constant LEVEL_BONUS_STEP_BPS = 100;
    uint16 public constant FORGED_BONUS_BPS = 500;
    uint256 public constant EARLY_PENALTY_BPS = 100;

    // EVENTS

    event Staked(
        address indexed user,
        uint256 indexed tokenId,
        bool isForged,
        uint8 level,
        uint256 nominal,
        uint16 durationDays,
        uint32 startTs,
        uint32 endTs,
        uint16 baseAprBps,
        uint16 totalAprBps,
        uint256 expectedReward
    );

    event StakeRedeemed(
        address indexed user,
        uint256 indexed tokenId,
        bool matured,
        uint256 reward,
        uint256 remintedNominal
    );

    // MODIFIERS

    modifier onlyDeployer() {
        require(msg.sender == DEPLOYER, "DEP");
        _;
    }

    // CONSTRUCTOR

    constructor(address core) ERC721("xEnchanted Stake", "xSTAKE") {
        require(core != address(0), "C0");
        CORE = IxEnchantedNFT(core);
        DEPLOYER = msg.sender;
    }

    // ADMINLESS ONE-TIME WIRING

    /**
     * @dev sets the external tokenURI lens once, then burns deployer wiring rights
     */
    function setTokenURILens(address lens) external onlyDeployer {
        require(TOKEN_URI_LENS == address(0), "URI_SET");
        require(lens != address(0), "URI0");
        require(lens.code.length != 0, "URI_CODE");

        TOKEN_URI_LENS = lens;
        DEPLOYER = address(0);
    }

    // TOKEN URI

    /**
     * @dev delegates Stake NFT metadata rendering to the configured URI lens
     */
    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        require(TOKEN_URI_LENS != address(0), "URI");
        return IStakeTokenURILens(TOKEN_URI_LENS).tokenURI(id);
    }

    // USER ACTIONS

    /**
     * @dev burns a Core or Forged NFT in Core and mints a tradable Stake NFT position
     */
    function stake(uint256 id, uint16 durationDays) external nonReentrant {
        require(durationDays >= MIN_DAYS, "DUR_MIN");
        require(durationDays <= MAX_DAYS, "DUR_MAX");
        require(block.timestamp <= type(uint32).max, "TS32");

        require(_ownerOf(id) == address(0), "EX");
        require(!pos[id].active, "ACT");

        uint16 baseApr = CORE.baseAprBpsNow();

        IxEnchantedNFT.NFTData memory snap = CORE.burnForStaking(id, msg.sender);
        require(snap.level > 1, "L1_STAKE");

        uint32 startTs = uint32(block.timestamp);
        uint32 durationSec = uint32(uint256(durationDays) * 1 days);
        uint32 endTs = startTs + durationSec;
        require(endTs > startTs, "TS");

        pos[id] = Pos({
            snap: snap,
            startTs: startTs,
            endTs: endTs,
            baseAprBps: baseApr,
            active: true
        });

        _safeMint(msg.sender, id);

        (, , uint16 totalAprBps) = _aprBreakdown(snap, baseApr);
        uint256 expectedReward = _calcReward(snap.nominal, totalAprBps, durationSec);

        emit Staked(
            msg.sender,
            id,
            snap.isForged,
            snap.level,
            snap.nominal,
            durationDays,
            startTs,
            endTs,
            baseApr,
            totalAprBps,
            expectedReward
        );
    }

    /**
     * @dev burns a Stake NFT and asks Core to restore the staked NFT through the Phoenix flow
     */
    function redeem(uint256 id) external nonReentrant {
        require(ownerOf(id) == msg.sender, "OWN");

        Pos memory p = pos[id];
        require(p.active, "NA");
        require(p.endTs > p.startTs, "TS");

        bool matured = block.timestamp >= uint256(p.endTs);
        uint256 durationSec = uint256(p.endTs) - uint256(p.startTs);
        (, , uint16 totalAprBps) = _aprBreakdown(p.snap, p.baseAprBps);
        uint256 reward = matured ? _calcReward(p.snap.nominal, totalAprBps, durationSec) : 0;
        uint256 remintedNominal = matured ? p.snap.nominal : _earlyRedeemNominal(p.snap.nominal);

        _burn(id);
        delete pos[id];

        CORE.redeemStakedAndPhoenixMint(
            msg.sender,
            id,
            p.snap,
            p.startTs,
            p.endTs,
            p.baseAprBps
        );

        emit StakeRedeemed(msg.sender, id, matured, reward, remintedNominal);
    }

    // PUBLIC CONVENIENCE GETTERS

    /**
     * @dev returns redeem state and reward amounts for an active stake position
     */
    function previewRedeem(uint256 id)
        external
        view
        returns (
            bool active,
            bool matured,
            uint32 startTs,
            uint32 endTs,
            uint16 baseAprBps,
            uint16 totalAprBps,
            uint256 expectedReward,
            uint256 availableReward,
            uint256 earlyRedeemNominal,
            uint256 maturityRedeemNominal
        )
    {
        Pos memory p = pos[id];
        active = p.active;

        if (!active || p.endTs <= p.startTs) {
            return (false, false, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        startTs = p.startTs;
        endTs = p.endTs;
        baseAprBps = p.baseAprBps;
        matured = block.timestamp >= uint256(endTs);

        uint256 durationSec = uint256(endTs) - uint256(startTs);
        (, , uint16 _totalAprBps) = _aprBreakdown(p.snap, baseAprBps);
        totalAprBps = _totalAprBps;

        expectedReward = _calcReward(p.snap.nominal, totalAprBps, durationSec);
        availableReward = matured ? expectedReward : 0;
        earlyRedeemNominal = matured ? 0 : _earlyRedeemNominal(p.snap.nominal);
        maturityRedeemNominal = p.snap.nominal;

        return (
            true,
            matured,
            startTs,
            endTs,
            baseAprBps,
            totalAprBps,
            expectedReward,
            availableReward,
            earlyRedeemNominal,
            maturityRedeemNominal
        );
    }

    /**
     * @dev returns the stored stake position snapshot and timing data
     */
    function getPos(uint256 id) external view returns (Pos memory) {
        return pos[id];
    }

    /**
     * @dev returns Stake NFT ids owned by an address by scanning the Core tokenId range
     */
    function walletOfOwner(address owner) external view returns (uint256[] memory) {
        require(owner != address(0), "OW0");

        uint256 upper = CORE.nextId();
        uint256 count = 0;

        for (uint256 id = 1; id < upper; ++id) {
            if (_ownerOf(id) == owner) {
                ++count;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;

        for (uint256 id = 1; id < upper; ++id) {
            if (_ownerOf(id) == owner) {
                ids[idx] = id;
                ++idx;
            }
        }

        return ids;
    }

    /**
     * @dev previews stake eligibility, APR breakdown and expected reward for a Core or Forged NFT
     */
    function previewStake(uint256 id, uint16 durationDays)
        external
        view
        returns (
            bool ok,
            string memory reason,
            bool isForged,
            uint8 level,
            uint256 nominal,
            uint16 baseAprBps,
            uint16 levelBonusBps,
            uint16 forgedBonusBps,
            uint16 totalAprBps,
            uint32 startTs,
            uint32 endTs,
            uint256 expectedReward
        )
    {
        if (durationDays < MIN_DAYS) {
            return (false, "DUR_MIN", false, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        if (durationDays > MAX_DAYS) {
            return (false, "DUR_MAX", false, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        if (!CORE.exists(id)) {
            return (false, "NO_NFT", false, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        if (_ownerOf(id) != address(0) || pos[id].active) {
            return (false, "EX", false, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        (
            uint8 _level,
            bool _isForged,
            uint64 createdAt,
            uint64 forgedAt,
            uint256 _nominal,
            uint256 xenBurned,
            uint256 xntdBurned,
            uint256 parentId1,
            uint256 parentId2
        ) = CORE.nftData(id);

        createdAt; forgedAt; xenBurned; xntdBurned; parentId1; parentId2;

        if (_level <= 1) {
            return (false, "L1_STAKE", _isForged, _level, _nominal, 0, 0, 0, 0, 0, 0, 0);
        }

        uint16 _baseAprBps = CORE.baseAprBpsNow();
        (uint16 _levelBonusBps, uint16 _forgedBonusBps, uint16 _totalAprBps) = _aprBreakdownRaw(
            _level,
            _isForged,
            _baseAprBps
        );

        require(block.timestamp <= type(uint32).max, "TS32V");
        uint32 _startTs = uint32(block.timestamp);
        uint32 _endTs = _startTs + uint32(uint256(durationDays) * 1 days);

        uint256 dur = uint256(_endTs) - uint256(_startTs);
        uint256 _expectedReward = _calcReward(_nominal, _totalAprBps, dur);

        return (
            true,
            "",
            _isForged,
            _level,
            _nominal,
            _baseAprBps,
            _levelBonusBps,
            _forgedBonusBps,
            _totalAprBps,
            _startTs,
            _endTs,
            _expectedReward
        );
    }

    /**
     * @dev returns an aggregated view for one Stake NFT
     */
    function getStakeView(uint256 id) external view returns (StakeView memory) {
        address owner = ownerOf(id);
        Pos memory p = pos[id];
        return _buildStakeView(id, owner, p);
    }

    /**
     * @dev returns aggregated views for multiple Stake NFTs
     */
    function getStakeViews(uint256[] calldata ids) external view returns (StakeView[] memory views_) {
        views_ = new StakeView[](ids.length);

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            address owner = ownerOf(id);
            Pos memory p = pos[id];
            views_[i] = _buildStakeView(id, owner, p);
        }
    }

    // INTERNAL METHODS

    /**
     * @dev builds the external StakeView object from stored position data
     */
    function _buildStakeView(uint256 id, address owner, Pos memory p) internal view returns (StakeView memory) {
        bool active = p.active && p.endTs > p.startTs;
        bool matured = active && block.timestamp >= uint256(p.endTs);

        uint16 durationDays = 0;
        uint16 levelBonusBps = 0;
        uint16 forgedBonusBps = 0;
        uint16 totalAprBps = 0;
        uint256 expectedReward = 0;
        uint256 availableReward = 0;
        uint256 earlyRedeemNominal = 0;
        uint256 maturityRedeemNominal = 0;

        if (active) {
            uint256 durationSec = uint256(p.endTs) - uint256(p.startTs);
            durationDays = uint16(durationSec / 1 days);
            (levelBonusBps, forgedBonusBps, totalAprBps) = _aprBreakdown(p.snap, p.baseAprBps);
            expectedReward = _calcReward(p.snap.nominal, totalAprBps, durationSec);
            availableReward = matured ? expectedReward : 0;
            earlyRedeemNominal = matured ? 0 : _earlyRedeemNominal(p.snap.nominal);
            maturityRedeemNominal = p.snap.nominal;
        }

        return StakeView({
            tokenId: id,
            owner: owner,
            isForged: p.snap.isForged,
            level: p.snap.level,
            nominal: p.snap.nominal,
            startTs: p.startTs,
            endTs: p.endTs,
            durationDays: durationDays,
            active: p.active,
            matured: matured,
            baseAprBps: p.baseAprBps,
            levelBonusBps: levelBonusBps,
            forgedBonusBps: forgedBonusBps,
            totalAprBps: totalAprBps,
            expectedReward: expectedReward,
            availableReward: availableReward,
            earlyRedeemNominal: earlyRedeemNominal,
            maturityRedeemNominal: maturityRedeemNominal
        });
    }

    /**
     * @dev calculates APR components from a stored Core/Forged NFT snapshot
     */
    function _aprBreakdown(IxEnchantedNFT.NFTData memory snap, uint16 baseAprBps)
        internal
        pure
        returns (uint16 levelBonusBps, uint16 forgedBonusBps, uint16 totalAprBps)
    {
        return _aprBreakdownRaw(snap.level, snap.isForged, baseAprBps);
    }

    /**
     * @dev calculates base APR + level bonus + optional Forged NFT bonus
     */
    function _aprBreakdownRaw(uint8 level, bool isForged, uint16 baseAprBps)
        internal
        pure
        returns (uint16 levelBonusBps, uint16 forgedBonusBps, uint16 totalAprBps)
    {
        require(level > 1, "L1_STAKE");

        levelBonusBps = uint16(uint256(level - 1) * LEVEL_BONUS_STEP_BPS);
        forgedBonusBps = isForged ? FORGED_BONUS_BPS : 0;
        totalAprBps = baseAprBps + levelBonusBps + forgedBonusBps;
    }

    /**
     * @dev calculates deterministic stake reward for the full selected duration
     */
    function _calcReward(uint256 nominal, uint16 totalAprBps, uint256 durationSec) internal pure returns (uint256) {
        return Math.mulDiv(nominal, uint256(totalAprBps) * durationSec, 365 days * BPS_DENOM);
    }

    /**
     * @dev applies the early redeem nominal penalty while preserving non-zero nominal values
     */
    function _earlyRedeemNominal(uint256 nominal) internal pure returns (uint256 out) {
        out = Math.mulDiv(nominal, BPS_DENOM - EARLY_PENALTY_BPS, BPS_DENOM, Math.Rounding.Ceil);
        if (out == 0 && nominal != 0) out = 1;
    }
}
