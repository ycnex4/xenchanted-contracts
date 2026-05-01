// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IXENToken {
    function burn(address user, uint256 amount) external;
}

interface IXNTDToken {
    function mint(address to, uint256 amount) external;
    function CORE() external view returns (address);
    function bindForge(address forge) external;
}

interface IBurnRedeemable {
    function onTokenBurned(address user, uint256 amount) external;
}

interface ICoreTokenURILens {
    function tokenURI(uint256 id) external view returns (string memory);
}

/**
 * xEnchantedNFT (Core)
 * - No admin keys, no pausable, no enumerable.
 * - init-once wiring for XNTD / STAKING / FORGE.
 * - Mint L1 via XEN burn (time-halving schedule).
 * - Enchant (NO MIXING):
 *    ordinary+ordinary => avg*3 (ordinary)
 *    forged+forged     => A+B   (forged, 1:1)
 * - Redeem: burn NFT => mint XNTD = nominal
 * - Phoenix-stake hooks (only STAKING)
 * - Forge hooks (only FORGE), base L1 always burned, nominal irrelevant.
 */
contract xEnchantedNFT is ERC721, IBurnRedeemable {
    // --------- constants ----------
    uint256 public constant HALVING_INTERVAL = 180 days;
    uint256 public constant ENCHANT_MULTIPLIER = 3;
    uint8   public constant MAX_LEVEL = 22;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant EARLY_PENALTY_BPS = 100; // 1%
    uint256 public constant MAX_WALLET_NFTS = 60;

    // --------- immutable ----------
    IXENToken public immutable XEN;
    uint64 public immutable GENESIS_TS;

    uint256 public immutable INITIAL_NOMINAL;
    uint256 public immutable INITIAL_XEN_BURN;

    address public DEPLOYER;

    // --------- init-once wiring ----------
    IXNTDToken public XNTD;
    address public STAKING;
    address public FORGE;
    address public TOKEN_URI_LENS;
    bool public initialized;

    // --------- data ----------
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
    struct CoreView {
        uint256 tokenId;
        address owner;
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

    mapping(uint256 => NFTData) public nftData;
    uint256 private _nextId;

    // --------- events ----------
    event Init(address xntd, address staking, address forge);

    event Minted(uint256 indexed id, address indexed to, uint8 lvl, uint256 nom, bool forged);
    event Enchanted(uint256 indexed id, uint256 indexed p1, uint256 indexed p2, uint8 lvl, uint256 nom, bool forged);
    event Redeemed(uint256 indexed id, address indexed owner, uint256 nom);

    event StakeBurn(uint256 indexed id, address indexed owner);
    event Phoenix(uint256 indexed id, address indexed to, bool matured, uint256 reward, uint256 nomAfter);

    event ForgeBurn(uint256 indexed id, address indexed owner);
    event ForgeMint(uint256 indexed id, address indexed to, uint256 nom);

    // --------- modifiers ----------
    modifier onlyDeployer() {
        require(msg.sender == DEPLOYER, "DEP");
        _;
    }
    modifier onlyStaking() {
        require(msg.sender == STAKING, "STK");
        _;
    }
    modifier onlyForge() {
        require(msg.sender == FORGE, "FRG");
        _;
    }
    modifier isInit() {
        require(initialized, "INI");
        _;
    }

    constructor(
        address xenToken,
        uint256 initialNominal,
        uint256 initialXenBurn
    ) ERC721("xEnchanted Core", "xCORE") {
        require(xenToken != address(0), "XEN");
        require(initialNominal != 0, "NOM");
        require(initialXenBurn != 0, "XBR");

        XEN = IXENToken(xenToken);
        GENESIS_TS = uint64(block.timestamp);

        INITIAL_NOMINAL = initialNominal;
        INITIAL_XEN_BURN = initialXenBurn;

        DEPLOYER = msg.sender;
        _nextId = 1;
    }

    function setTokenURILens(address lens) external onlyDeployer {
        require(TOKEN_URI_LENS == address(0), "URI_SET");
        require(lens != address(0), "URI0");
        require(lens.code.length != 0, "URI_CODE");
        TOKEN_URI_LENS = lens;
    }

    function init(address xntd, address staking, address forge) external onlyDeployer {
    require(!initialized, "INI2");
    require(xntd != address(0) && staking != address(0) && forge != address(0), "ADR");

    // anti-footgun: no duplicates
    require(xntd != staking && xntd != forge && staking != forge, "DUP");

    // must be deployed contracts
    require(_isContract(xntd) && _isContract(staking) && _isContract(forge), "CODE");

    // -------- handshake: Stake must point to this Core --------
    address stakeCore = _readAddr(staking, abi.encodeWithSignature("CORE()"));
    require(stakeCore == address(this), "STK_CORE");

    // -------- handshake: Forge must point to this Core --------
    address forgeCore = _readAddr(forge, abi.encodeWithSignature("CORE()"));
    require(forgeCore == address(this), "FRG_CORE");

    // -------- handshake: Forge must use this XNTD --------
    address forgeXntd = _readAddr(forge, abi.encodeWithSignature("XNTD()"));
    require(forgeXntd == xntd, "FRG_XNTD");

    // -------- handshake: XNTD must be wired to this Core --------
    require(IXNTDToken(xntd).CORE() == address(this), "XNTD_CORE");

    // Bind Forge in XNTD once. This enables Forge burn without ERC20 approve,
    // while keeping the path immutable/no-admin after Core.init(...).
    IXNTDToken(xntd).bindForge(forge);

    // commit wiring
    XNTD = IXNTDToken(xntd);
    STAKING = staking;
    FORGE = forge;

    require(TOKEN_URI_LENS != address(0), "URI");

    initialized = true;

    // burn deployer rights permanently
    DEPLOYER = address(0);

    emit Init(xntd, staking, forge);
}

function _isContract(address a) internal view returns (bool) {
    return a.code.length != 0;
}

function _staticOk(address target, bytes memory data) internal view returns (bool) {
    (bool ok, ) = target.staticcall(data);
    return ok;
}

function _readAddr(address target, bytes memory data) internal view returns (address out) {
    (bool ok, bytes memory ret) = target.staticcall(data);
    require(ok && ret.length >= 32, "HSHK");
    out = abi.decode(ret, (address));
}

    // --------- halving (computed) ----------
    function _halvingIndex() internal view returns (uint256 k) {
    unchecked { k = (block.timestamp - GENESIS_TS) / HALVING_INTERVAL; }
    if (k > 255) k = 255; // sat: enough for shifts and any future math
    }

    function _applyHalving(uint256 value, uint256 k) internal pure returns (uint256 out) {
        if (k >= 256) return 1;
        out = value >> k;
        if (out == 0) out = 1;
    }

    function currentBaseNominal() public view returns (uint256) {
        return _applyHalving(INITIAL_NOMINAL, _halvingIndex());
    }

    function currentXenBurnAmount() public view returns (uint256) {
        return _applyHalving(INITIAL_XEN_BURN, _halvingIndex());
    }

    /// @notice global base APR for staking (bps), fixed at stake time in xEnchantedStake.
    function baseAprBpsNow() public view returns (uint16) {
        uint256 k = _halvingIndex(); // 180d epochs
        uint256 dec = k * 100;       // -1% per epoch = -100 bps
        if (dec >= 800) return 200;  // min 2%
        return uint16(1000 - dec);   // 10% down to 2%
    }

    // --------- mint L1 ----------
    function mintWithXEN() external isInit nonReentrant {
    require(balanceOf(msg.sender) < MAX_WALLET_NFTS, "MAX_WALLET");
    
    uint256 xenAmt = currentXenBurnAmount();
    uint256 nom = currentBaseNominal();

    XEN.burn(msg.sender, xenAmt);

    NFTData memory nd = NFTData({
        level: 1,
        isForged: false,

        createdAt: uint64(block.timestamp),
        forgedAt: 0,

        nominal: nom,

        xenBurned: xenAmt,
        xntdBurned: 0,

        parentId1: 0,
        parentId2: 0
    });

    _assertInv(nd);

    uint256 id = _nextId++;

    nftData[id] = nd;      // state first
    _safeMint(msg.sender, id);

    emit Minted(id, msg.sender, 1, nom, false);
}

    // --------- enchant (final canon, NO MIXING) ----------
    function enchant(uint256 id1, uint256 id2) external isInit nonReentrant {
    require(id1 != id2, "SAME");
    require(ownerOf(id1) == msg.sender, "O1");
    require(ownerOf(id2) == msg.sender, "O2");

    NFTData memory a = nftData[id1];
    NFTData memory b = nftData[id2];

    _assertInv(a);
    _assertInv(b);

    require(a.level == b.level, "LVL");
    require(a.level > 0, "BAD");
    require(a.level < MAX_LEVEL, "MAX");
    require(a.isForged == b.isForged, "TYPE");

    bool forged = a.isForged;

    uint256 newNom;
    if (forged) {
        newNom = a.nominal + b.nominal;
    } else {
        uint256 avg = (a.nominal + b.nominal) / 2;
        newNom = avg * ENCHANT_MULTIPLIER;
    }

    uint8 newLvl = a.level + 1;

    _burn(id1);
    _burn(id2);
    delete nftData[id1];
    delete nftData[id2];

    uint256 id = _nextId++;

    NFTData memory nd = NFTData({
        level: newLvl,
        isForged: forged,
        createdAt: forged ? 0 : uint64(block.timestamp),
        forgedAt: forged ? uint64(block.timestamp) : 0,
        nominal: newNom,
        xenBurned: forged ? 0 : (a.xenBurned + b.xenBurned),
        xntdBurned: forged ? (a.xntdBurned + b.xntdBurned) : 0,
        parentId1: id1,
        parentId2: id2
    });

    _assertInv(nd);

    nftData[id] = nd;          // ✅ ОБЯЗАТЕЛЬНО
    _safeMint(msg.sender, id); // ✅ safeMint после state

    emit Enchanted(id, id1, id2, newLvl, newNom, forged);
}

    // --------- redeem ----------
    function redeem(uint256 id)
    external
    isInit
    nonReentrant
    returns (uint256 minted)
{
    require(ownerOf(id) == msg.sender, "OWN");

    // ✅ validate stored state before burning
    NFTData memory d = nftData[id];
    _assertInv(d);

    uint256 nom = d.nominal;

    // ✅ Effects
    _burn(id);
    delete nftData[id];

    // ✅ Interaction (reverts => whole tx reverts, including burn/delete)
    XNTD.mint(msg.sender, nom);

    emit Redeemed(id, msg.sender, nom);
    return nom;
}

    // --------- Phoenix stake hooks (only STAKING) ----------
    function burnForStaking(uint256 id, address ownerExpected)
    external
    onlyStaking
    isInit
    nonReentrant
    returns (NFTData memory snap)
{
    require(ownerOf(id) == ownerExpected, "OS");

    snap = nftData[id];
    _assertInv(snap);
    require(snap.level > 1, "L1_STAKE");

    // ✅ Effects
    _burn(id);
    delete nftData[id];

    emit StakeBurn(id, ownerExpected);
    return snap;
}

    function redeemStakedAndPhoenixMint(
    address to,
    uint256 id,
    NFTData calldata snap,
    uint32 startTs,
    uint32 endTs,
    uint16 baseAprBpsAtStake
) external onlyStaking isInit nonReentrant {
    require(to != address(0), "TO");
    require(_ownerOf(id) == address(0), "EX");
    require(endTs > startTs, "TS");

    // ✅ duration bounds: must match Stake rules (30..730 days)
    uint256 dur = uint256(endTs) - uint256(startTs);
    require(dur >= 30 days, "DUR_MIN");
    require(dur <= 730 days, "DUR_MAX");

    // ✅ APR sanity: base APR in your protocol is 10%..2% => 1000..200 bps
    require(baseAprBpsAtStake >= 200 && baseAprBpsAtStake <= 1000, "APR");
    require(snap.level > 1, "L1_STAKE");

    bool matured = block.timestamp >= uint256(endTs);

    NFTData memory out = snap;
    uint256 reward = 0;

    if (matured) {
        reward = _calcStakeReward(out, dur, baseAprBpsAtStake);
    } else {
        out.nominal = Math.mulDiv(
            out.nominal,
            (BPS_DENOM - EARLY_PENALTY_BPS),
            BPS_DENOM,
            Math.Rounding.Ceil
        );
        if (out.nominal == 0) out.nominal = 1;
    }

    _assertInv(out);
    nftData[id] = out;
    _safeMint(to, id);

    if (matured && reward != 0) {
        XNTD.mint(to, reward);
    }

    emit Phoenix(id, to, matured, reward, out.nominal);
}

    function _calcStakeReward(NFTData memory d, uint256 durationSec, uint16 baseAprBpsAtStake)
    internal
    pure
    returns (uint256)
{
    require(d.level > 1, "L1_STAKE");

    uint256 levelBonusBps = uint256(d.level - 1) * 100;
    uint256 aprBps = uint256(baseAprBpsAtStake) + levelBonusBps;

    if (d.isForged) {
        aprBps += 500;
    }

    uint256 num = aprBps * durationSec;
    return Math.mulDiv(d.nominal, num, 365 days * BPS_DENOM);
}

    // --------- Forge hooks (only FORGE) ----------
    function burnL1ForForge(uint256 baseId, address ownerExpected)
    external
    onlyForge
    isInit
    nonReentrant
    returns (NFTData memory snap)
{
    require(ownerOf(baseId) == ownerExpected, "OF");

    snap = nftData[baseId];
    _assertInv(snap);

    require(!snap.isForged, "F1");   // ✅ только ordinary
    require(snap.level == 1, "L1");  // ✅ только L1

    _burn(baseId);
    delete nftData[baseId];

    emit ForgeBurn(baseId, ownerExpected);
    return snap;
}

    /// @notice forge-mint forged NFT with explicit XNTD burn provenance
    function mintForgedFromXNTD(address to, uint256 nom, uint256 xntdTotalBurned)
    external
    onlyForge
    isInit
    nonReentrant 
    returns (uint256 id)
{
    require(to != address(0), "TO2");
    require(nom != 0, "N0");
    require(xntdTotalBurned != 0, "B0");
    require(nom == xntdTotalBurned, "NEQ");

    id = _nextId++;

    // build state
    NFTData memory nd = NFTData({
        level: 1,
        isForged: true,

        createdAt: 0,
        forgedAt: uint64(block.timestamp),

        nominal: nom,

        xenBurned: 0,
        xntdBurned: xntdTotalBurned,

        parentId1: 0,
        parentId2: 0
    });

    _assertInv(nd);

    // ✅ commit state BEFORE safeMint (safeMint may call onERC721Received)
    nftData[id] = nd;

    // ✅ mint after state is consistent
    _safeMint(to, id);

    emit ForgeMint(id, to, nom);
    emit Minted(id, to, 1, nom, true);
    return id;
}

    function _assertInv(NFTData memory d) internal pure {
    // level + nominal
    require(d.level > 0, "L0");
    require(d.level <= MAX_LEVEL, "LM");
    require(d.nominal != 0, "N0");

    if (d.isForged) {
        // timestamps
        require(d.createdAt == 0, "CT0");
        require(d.forgedAt != 0, "FT0");

        // burn provenance
        require(d.xenBurned == 0, "XB0");
        require(d.xntdBurned != 0, "TB0");
    } else {
        // timestamps
        require(d.createdAt != 0, "CT1");
        require(d.forgedAt == 0, "FT1");

        // burn provenance
        require(d.xenBurned != 0, "XB1");
        require(d.xntdBurned == 0, "TB1");
    }

    // parents vs level
    if (d.level == 1) {
        require(d.parentId1 == 0 && d.parentId2 == 0, "P10");
    } else {
        require(d.parentId1 != 0 && d.parentId2 != 0, "P1N");
        require(d.parentId1 != d.parentId2, "P!"); 
    }
    }
    uint256 private _lock;

    modifier nonReentrant() {
        require(_lock == 0, "RE");
        _lock = 1;
         _;
        _lock = 0;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id); // revert if token does not exist
        require(TOKEN_URI_LENS != address(0), "URI");
        return ICoreTokenURILens(TOKEN_URI_LENS).tokenURI(id);
    }

    function exists(uint256 id) external view returns (bool) {
    return _ownerOf(id) != address(0);
}

    function nextId() external view returns (uint256) {
        return _nextId;
    }

    function walletOfOwner(address owner) external view returns (uint256[] memory) {
        require(owner != address(0), "OW0");

        uint256 supplyUpper = _nextId;
        uint256 count = 0;

        for (uint256 id = 1; id < supplyUpper; ++id) {
            if (_ownerOf(id) == owner) {
                ++count;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;

        for (uint256 id = 1; id < supplyUpper; ++id) {
            if (_ownerOf(id) == owner) {
                ids[idx] = id;
                ++idx;
            }
        }

        return ids;
    }

    function previewRedeem(uint256 id)
        external
        view
        returns (
            bool exists_,
            bool isForged,
            uint8 level,
            uint256 nominal,
            uint256 redeemAmount
        )
    {
        if (_ownerOf(id) == address(0)) {
            return (false, false, 0, 0, 0);
        }

        NFTData memory d = nftData[id];

        return (
            true,
            d.isForged,
            d.level,
            d.nominal,
            d.nominal
        );
    }

    function previewEnchant(uint256 id1, uint256 id2)
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
        if (id1 == id2) {
            return (false, "SAME", false, 0, 0);
        }

        if (_ownerOf(id1) == address(0)) {
            return (false, "E1", false, 0, 0);
        }

        if (_ownerOf(id2) == address(0)) {
            return (false, "E2", false, 0, 0);
        }

        NFTData memory a = nftData[id1];
        NFTData memory b = nftData[id2];

        if (a.level != b.level) {
            return (false, "LVL", false, 0, 0);
        }

        if (a.level == 0) {
            return (false, "BAD", false, 0, 0);
        }

        if (a.level >= MAX_LEVEL) {
            return (false, "MAX", false, 0, 0);
        }

        if (a.isForged != b.isForged) {
            return (false, "TYPE", false, 0, 0);
        }

        bool forged = a.isForged;
        uint256 newNom;

        if (forged) {
            newNom = a.nominal + b.nominal;
        } else {
            uint256 avg = (a.nominal + b.nominal) / 2;
            newNom = avg * ENCHANT_MULTIPLIER;
        }

        return (true, "", forged, a.level + 1, newNom);
    }

    function getCoreView(uint256 id) external view returns (CoreView memory) {
        address owner = ownerOf(id);
        NFTData memory d = nftData[id];

        return CoreView({
            tokenId: id,
            owner: owner,
            level: d.level,
            isForged: d.isForged,
            createdAt: d.createdAt,
            forgedAt: d.forgedAt,
            nominal: d.nominal,
            xenBurned: d.xenBurned,
            xntdBurned: d.xntdBurned,
            parentId1: d.parentId1,
            parentId2: d.parentId2
        });
    }

    function getCoreViews(uint256[] calldata ids) external view returns (CoreView[] memory views_) {
        views_ = new CoreView[](ids.length);

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            address owner = ownerOf(id);
            NFTData memory d = nftData[id];

            views_[i] = CoreView({
                tokenId: id,
                owner: owner,
                level: d.level,
                isForged: d.isForged,
                createdAt: d.createdAt,
                forgedAt: d.forgedAt,
                nominal: d.nominal,
                xenBurned: d.xenBurned,
                xntdBurned: d.xntdBurned,
                parentId1: d.parentId1,
                parentId2: d.parentId2
            });
        }
    }

    // --- XEN burn callback (required by XEN) ---
    function onTokenBurned(address user, uint256 amount) external view override {
    require(msg.sender == address(XEN), "XEN_CB");
    user; amount;
}

    // --- ERC165: tell XEN we support IBurnRedeemable ---
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == type(IBurnRedeemable).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}