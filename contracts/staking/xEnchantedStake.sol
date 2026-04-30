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
 * xEnchantedStake
 * - ERC-721 position NFT (tradeable)
 * - tokenId == original NFT id
 * - stake(): burns original in Core, mints position to user, stores snapshot + times + baseAprBpsAtStake
 * - redeem(): burns position, calls Core to phoenix-mint original back to current owner and mint rewards if matured
 *
 * PATCH:
 * - free duration choice: 30..730 days (2 years) with 1-day step
 * - removed durations[] / durationsCount()
 * - CEI: write pos BEFORE _safeMint (safeMint may call onERC721Received)
 * - uint32 timestamp safety
 */
contract xEnchantedStake is ERC721, ReentrancyGuard {
    IxEnchantedNFT public immutable CORE;
    address public DEPLOYER;
    address public TOKEN_URI_LENS;

    struct Pos {
        IxEnchantedNFT.NFTData snap; // snapshot at stake
        uint32 startTs;
        uint32 endTs;
        uint16 baseAprBps;           // fixed at stake time
        bool active;
    }

    struct StakeView {
        uint256 tokenId;
        address owner;
        uint8 level;
        bool isForged;
        uint256 nominal;
        uint32 startTs;
        uint32 endTs;
        uint16 baseAprBps;
        bool active;
        bool matured;
        uint256 rewardIfMatured;
        uint256 nominalIfEarly;
    }

    // tokenId => position
    mapping(uint256 => Pos) public pos;

    // free duration bounds (days)
    uint16 public constant MIN_DAYS = 30;
    uint16 public constant MAX_DAYS = 730; // 2 years

    event Stake(uint256 indexed id, address indexed owner, uint32 startTs, uint32 endTs, uint16 baseAprBps);
    event Redeem(uint256 indexed id, address indexed owner, bool matured);

    modifier onlyDeployer() {
        require(msg.sender == DEPLOYER, "DEP");
        _;
    }

    constructor(address core) ERC721("xEnchanted Stake", "xSTAKE") {
        require(core != address(0), "C0");
        CORE = IxEnchantedNFT(core);
        DEPLOYER = msg.sender;
    }

    function setTokenURILens(address lens) external onlyDeployer {
        require(TOKEN_URI_LENS == address(0), "URI_SET");
        require(lens != address(0), "URI0");
        require(lens.code.length != 0, "URI_CODE");

        TOKEN_URI_LENS = lens;

        // burn deployer rights permanently after lens is wired
        DEPLOYER = address(0);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id); // revert if token does not exist
        require(TOKEN_URI_LENS != address(0), "URI");
        return IStakeTokenURILens(TOKEN_URI_LENS).tokenURI(id);
    }

    /// @notice Stake with any duration in whole days (1-day step), from 30 to 730 days.
    function stake(uint256 id, uint16 durationDays) external nonReentrant {
        require(durationDays >= MIN_DAYS, "DUR_MIN");
        require(durationDays <= MAX_DAYS, "DUR_MAX");

        // timestamp must fit uint32 (protocol uses uint32 in positions)
        require(block.timestamp <= type(uint32).max, "TS32");

        require(_ownerOf(id) == address(0), "EX"); // no active position token
        require(!pos[id].active, "ACT");           // double safety

        // fix base APR at stake time for predictability/tradeability
        uint16 baseApr = CORE.baseAprBpsNow();

        // burn original in Core and receive snapshot (Core enforces ownership)
        IxEnchantedNFT.NFTData memory snap = CORE.burnForStaking(id, msg.sender);

        uint32 startTs = uint32(block.timestamp);

        // 1-day step enforced by integer durationDays
        uint32 durationSec = uint32(uint256(durationDays) * 1 days);
        uint32 endTs = startTs + durationSec;

        // overflow / sanity
        require(endTs > startTs, "TS");

        // ✅ CEI: commit state BEFORE _safeMint (safeMint may call onERC721Received)
        pos[id] = Pos({
            snap: snap,
            startTs: startTs,
            endTs: endTs,
            baseAprBps: baseApr,
            active: true
        });

        // mint position NFT with SAME id
        _safeMint(msg.sender, id);

        emit Stake(id, msg.sender, startTs, endTs, baseApr);
    }

    function redeem(uint256 id) external nonReentrant {
        require(ownerOf(id) == msg.sender, "OWN");

        Pos memory p = pos[id];
        require(p.active, "NA");
        require(p.endTs > p.startTs, "TS"); // safety

        bool matured = block.timestamp >= uint256(p.endTs);

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

        emit Redeem(id, msg.sender, matured);
    }

    function previewRedeem(uint256 id)
        external
        view
        returns (bool active, bool matured, uint32 startTs, uint32 endTs, uint16 baseAprBps, uint256 reward)
    {
        Pos memory p = pos[id];
        active = p.active;

        if (!active) {
            return (false, false, 0, 0, 0, 0);
        }

        startTs = p.startTs;
        endTs = p.endTs;
        baseAprBps = p.baseAprBps;

        // hard safety (same spirit as Core)
        if (endTs <= startTs) {
            // treat as not matured and reward 0 (position is abnormal, but view stays safe)
            return (true, false, startTs, endTs, baseAprBps, 0);
        }

        matured = block.timestamp >= uint256(endTs);

        if (!matured) {
            // no partial rewards
            return (true, false, startTs, endTs, baseAprBps, 0);
        }

        // reward = nominal * aprBps * duration / (365d * 10000)
        uint256 levelBonusBps = 0;
        if (p.snap.level > 1) levelBonusBps = uint256(p.snap.level - 1) * 100;

        uint256 aprBps = uint256(baseAprBps) + levelBonusBps;

        if (p.snap.isForged && p.snap.level > 1) {
            aprBps += 500; // +5%
        }

        uint256 dur = uint256(endTs) - uint256(startTs);
        reward = Math.mulDiv(p.snap.nominal, aprBps * dur, 365 days * 10_000);

        return (true, true, startTs, endTs, baseAprBps, reward);
    }

    function getPos(uint256 id) external view returns (Pos memory) {
        return pos[id];
    }

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
            uint256 rewardIfMatured
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

        uint16 _baseAprBps = CORE.baseAprBpsNow();
        uint16 _levelBonusBps = _level > 1 ? uint16(uint256(_level - 1) * 100) : 0;
        uint16 _forgedBonusBps = (_isForged && _level > 1) ? 500 : 0;
        uint16 _totalAprBps = _baseAprBps + _levelBonusBps + _forgedBonusBps;

        require(block.timestamp <= type(uint32).max, "TS32V");
        uint32 _startTs = uint32(block.timestamp);
        uint32 _endTs = _startTs + uint32(uint256(durationDays) * 1 days);

        uint256 dur = uint256(_endTs) - uint256(_startTs);
        uint256 _rewardIfMatured = Math.mulDiv(
            _nominal,
            uint256(_totalAprBps) * dur,
            365 days * 10_000
        );

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
            _rewardIfMatured
        );
    }

    function getStakeView(uint256 id) external view returns (StakeView memory) {
        address owner = ownerOf(id);
        Pos memory p = pos[id];

        bool matured = p.active && block.timestamp >= uint256(p.endTs);
        uint256 rewardIfMatured = 0;

        if (p.active && matured && p.endTs > p.startTs) {
            uint256 levelBonusBps = 0;
            if (p.snap.level > 1) levelBonusBps = uint256(p.snap.level - 1) * 100;

            uint256 aprBps = uint256(p.baseAprBps) + levelBonusBps;
            if (p.snap.isForged && p.snap.level > 1) {
                aprBps += 500;
            }

            uint256 dur = uint256(p.endTs) - uint256(p.startTs);
            rewardIfMatured = Math.mulDiv(p.snap.nominal, aprBps * dur, 365 days * 10_000);
        }

        uint256 nominalIfEarly = Math.mulDiv(
            p.snap.nominal,
            9900,
            10_000,
            Math.Rounding.Ceil
        );
        if (nominalIfEarly == 0 && p.snap.nominal != 0) {
            nominalIfEarly = 1;
        }

        return StakeView({
            tokenId: id,
            owner: owner,
            level: p.snap.level,
            isForged: p.snap.isForged,
            nominal: p.snap.nominal,
            startTs: p.startTs,
            endTs: p.endTs,
            baseAprBps: p.baseAprBps,
            active: p.active,
            matured: matured,
            rewardIfMatured: rewardIfMatured,
            nominalIfEarly: nominalIfEarly
        });
    }

    function getStakeViews(uint256[] calldata ids) external view returns (StakeView[] memory views_) {
        views_ = new StakeView[](ids.length);

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            address owner = ownerOf(id);
            Pos memory p = pos[id];

            bool matured = p.active && block.timestamp >= uint256(p.endTs);
            uint256 rewardIfMatured = 0;

            if (p.active && matured && p.endTs > p.startTs) {
                uint256 levelBonusBps = 0;
                if (p.snap.level > 1) levelBonusBps = uint256(p.snap.level - 1) * 100;

                uint256 aprBps = uint256(p.baseAprBps) + levelBonusBps;
                if (p.snap.isForged && p.snap.level > 1) {
                    aprBps += 500;
                }

                uint256 dur = uint256(p.endTs) - uint256(p.startTs);
                rewardIfMatured = Math.mulDiv(p.snap.nominal, aprBps * dur, 365 days * 10_000);
            }

            uint256 nominalIfEarly = Math.mulDiv(
                p.snap.nominal,
                9900,
                10_000,
                Math.Rounding.Ceil
            );
            if (nominalIfEarly == 0 && p.snap.nominal != 0) {
                nominalIfEarly = 1;
            }

            views_[i] = StakeView({
                tokenId: id,
                owner: owner,
                level: p.snap.level,
                isForged: p.snap.isForged,
                nominal: p.snap.nominal,
                startTs: p.startTs,
                endTs: p.endTs,
                baseAprBps: p.baseAprBps,
                active: p.active,
                matured: matured,
                rewardIfMatured: rewardIfMatured,
                nominalIfEarly: nominalIfEarly
            });
        }
    }
}