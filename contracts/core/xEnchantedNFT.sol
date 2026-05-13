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
 * xEnchantedNFT is the Core ERC721 contract of the xEnchanted Crypto protocol.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Core NFTs are minted through XEN burn, upgraded through enchant,
 * redeemed into XNTD, consumed by Forge, or burned into stake positions
 * and later restored through the Phoenix flow.
 *
 * Author: Sergey Stepanenko.
 */
contract xEnchantedNFT is ERC721, IBurnRedeemable {
    // PUBLIC CONSTANTS
    uint256 public constant HALVING_INTERVAL = 180 days;
    uint256 public constant ENCHANT_MULTIPLIER = 3;
    uint8   public constant MAX_LEVEL = 22;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant EARLY_PENALTY_BPS = 100; // 1%
    uint256 public constant MAX_WALLET_NFTS = 60;

    // IMMUTABLE PROTOCOL STATE
    IXENToken public immutable XEN;
    uint64 public immutable GENESIS_TS;

    uint256 public immutable INITIAL_NOMINAL;
    uint256 public immutable INITIAL_XEN_BURN;

    address public DEPLOYER;

    // INIT-ONCE PROTOCOL WIRING
    IXNTDToken public XNTD;
    address public STAKING;
    address public FORGE;
    address public TOKEN_URI_LENS;
    bool public initialized;

    // INTERNAL NFT TYPES AND STORAGE
    // INTERNAL TYPE TO DESCRIBE A CORE OR FORGED NFT
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
    // PUBLIC VIEW TYPE FOR FRONTEND AND LENS READS
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

    // OWNER INDEX FOR FRONTEND INVENTORY
    mapping(address => uint256[]) private _ownerTokenIds;
    mapping(uint256 => uint256) private _ownerTokenIndex;

    // EVENTS
    event Init(address xntd, address staking, address forge);

    event Minted(
        uint256 indexed id,
        address indexed to,
        uint8 lvl,
        uint256 nom,
        bool forged,
        uint256 xenBurned,
        uint256 xntdBurned
    );
    event Enchanted(
        uint256 indexed id,
        uint256 indexed p1,
        uint256 indexed p2,
        address owner,
        uint8 lvl,
        uint256 nom,
        bool forged,
        uint256 xenBurned,
        uint256 xntdBurned
    );
    event Redeemed(
        uint256 indexed id,
        address indexed owner,
        bool indexed forged,
        uint8 level,
        uint256 nominal,
        uint256 xntdMinted
    );

    event StakeBurn(
        uint256 indexed id,
        address indexed owner,
        bool indexed forged,
        uint8 level,
        uint256 nominal
    );
    event Phoenix(
        uint256 indexed id,
        address indexed to,
        bool indexed matured,
        bool forged,
        uint8 level,
        uint256 reward,
        uint256 nomAfter
    );

    event ForgeBurn(uint256 indexed id, address indexed owner);
    event ForgeMint(
        uint256 indexed id,
        address indexed to,
        uint256 nom,
        uint256 xntdBurned
    );

    // MODIFIERS
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

    // CONSTRUCTOR

    /**
     * @dev sets immutable XEN and genesis values for this deployment
     */
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

    // ADMINLESS ONE-TIME URI WIRING

    /**
     * @dev sets the external tokenURI lens once before deployer rights are burned
     */
    function setTokenURILens(address lens) external onlyDeployer {
        require(TOKEN_URI_LENS == address(0), "URI_SET");
        require(lens != address(0), "URI0");
        require(lens.code.length != 0, "URI_CODE");
        TOKEN_URI_LENS = lens;
    }

    /**
     * @dev wires XNTD, Stake and Forge once, validates handshakes and burns deployer rights
     */
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

    /**
     * @dev returns true when an address contains deployed code
     */
function _isContract(address a) internal view returns (bool) {
    return a.code.length != 0;
}

    /**
     * @dev reads an address through staticcall and reverts if the handshake fails
     */
function _readAddr(address target, bytes memory data) internal view returns (address out) {
    (bool ok, bytes memory ret) = target.staticcall(data);
    require(ok && ret.length >= 32, "HSHK");
    out = abi.decode(ret, (address));
}

    // HALVING LOGIC
    /**
     * @dev calculates the active halving epoch from the deployment genesis timestamp
     */
    function _halvingIndex() internal view returns (uint256) {
        return epochAt(block.timestamp);
    }

    /**
     * @dev applies binary halving to a value and never returns zero
     */
    function _applyHalving(uint256 value, uint256 k) internal pure returns (uint256 out) {
        if (k >= 256) return 1;
        out = value >> k;
        if (out == 0) out = 1;
    }

    /**
     * @dev returns the halving epoch for an arbitrary timestamp
     */
    function epochAt(uint256 timestamp) public view returns (uint256 k) {
        if (timestamp <= uint256(GENESIS_TS)) {
            return 0;
        }

        unchecked {
            k = (timestamp - uint256(GENESIS_TS)) / HALVING_INTERVAL;
        }

        if (k > 255) k = 255;
    }

    /**
     * @dev returns the active halving epoch from the Core source of truth
     */
    function currentEpoch() public view returns (uint256) {
        return epochAt(block.timestamp);
    }

    /**
     * @dev returns the timestamp of the next halving boundary
     */
    function nextHalvingTs() public view returns (uint256) {
        uint256 k = currentEpoch();
        return uint256(GENESIS_TS) + ((k + 1) * HALVING_INTERVAL);
    }

    /**
     * @dev returns the current Core L1 nominal for the active epoch
     */
    function currentBaseNominal() public view returns (uint256) {
        return _applyHalving(INITIAL_NOMINAL, _halvingIndex());
    }

    /**
     * @dev returns the current XEN burn amount required to mint a Core L1
     */
    function currentXenBurnAmount() public view returns (uint256) {
        return _applyHalving(INITIAL_XEN_BURN, _halvingIndex());
    }

    /**
     * @dev returns the current global base APR for staking in basis points
     */
    function baseAprBpsNow() public view returns (uint16) {
        uint256 k = _halvingIndex(); // 180d epochs
        uint256 dec = k * 100;       // -1% per epoch = -100 bps
        if (dec >= 800) return 200;  // min 2%
        return uint16(1000 - dec);   // 10% down to 2%
    }

    // USER ACTIONS: CORE MINT
    /**
     * @dev creates a Core L1 NFT by burning the current epoch XEN amount
     */
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

    emit Minted(id, msg.sender, 1, nom, false, nd.xenBurned, nd.xntdBurned);
}

    // USER ACTIONS: ENCHANT
    /**
     * @dev consumes two same-type same-level NFTs and mints one next-level NFT
     */
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

    nftData[id] = nd;          // commit state before mint
    _safeMint(msg.sender, id); // mint after state is committed

    emit Enchanted(id, id1, id2, msg.sender, newLvl, newNom, forged, nd.xenBurned, nd.xntdBurned);
}

    // USER ACTIONS: REDEEM
    /**
     * @dev burns an owned Core or Forged NFT and mints XNTD equal to its nominal value
     */
    function redeem(uint256 id)
    external
    isInit
    nonReentrant
    returns (uint256 minted)
{
    require(ownerOf(id) == msg.sender, "OWN");

    // validate stored state before burning
    NFTData memory d = nftData[id];
    _assertInv(d);

    uint256 nom = d.nominal;

    // effects
    _burn(id);
    delete nftData[id];

    // interaction: revert rolls back burn/delete
    XNTD.mint(msg.sender, nom);

    emit Redeemed(id, msg.sender, d.isForged, d.level, nom, nom);
    return nom;
}

    // STAKING HOOKS
    /**
     * @dev burns an owned Core or Forged NFT for staking and returns its snapshot to Stake
     */
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

    // effects
    _burn(id);
    delete nftData[id];

    emit StakeBurn(id, ownerExpected, snap.isForged, snap.level, snap.nominal);
    return snap;
}

    /**
     * @dev restores the staked Core or Forged NFT with the same tokenId after stake redemption
     */
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

    // duration bounds: must match Stake rules (30..730 days)
    uint256 dur = uint256(endTs) - uint256(startTs);
    require(dur >= 30 days, "DUR_MIN");
    require(dur <= 730 days, "DUR_MAX");

    // APR sanity: protocol base APR is 10%..2% => 1000..200 bps
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

    emit Phoenix(id, to, matured, out.isForged, out.level, reward, out.nominal);
}

    /**
     * @dev calculates matured stake reward using fixed stake APR inputs
     */
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

    // FORGE HOOKS
    /**
     * @dev consumes a current-owner Core L1 NFT as the base requirement for Forge
     */
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

    require(!snap.isForged, "F1");   // Core L1 only
    require(snap.level == 1, "L1");  // level 1 only

    _burn(baseId);
    delete nftData[baseId];

    emit ForgeBurn(baseId, ownerExpected);
    return snap;
}

    /**
     * @dev mints a Forged NFT with XNTD burn provenance supplied by Forge
     */
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

    // commit state before safeMint (safeMint may call onERC721Received)
    nftData[id] = nd;

    // mint after state is consistent
    _safeMint(to, id);

    emit ForgeMint(id, to, nom, xntdTotalBurned);
    emit Minted(id, to, 1, nom, true, nd.xenBurned, nd.xntdBurned);
    return id;
}

    // INTERNAL INVARIANTS

    /**
     * @dev validates NFT state invariants for Core and Forged NFTs
     */
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

    /**
     * @dev minimal reentrancy guard for state-changing protocol flows
     */
    modifier nonReentrant() {
        require(_lock == 0, "RE");
        _lock = 1;
         _;
        _lock = 0;
    }

    // OWNER INDEX

    /**
     * @dev keeps the owner inventory index in sync with every mint, burn and transfer
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address previousOwner)
    {
        previousOwner = super._update(to, tokenId, auth);

        if (previousOwner != address(0)) {
            _removeTokenFromOwnerIndex(previousOwner, tokenId);
        }

        if (to != address(0)) {
            _addTokenToOwnerIndex(to, tokenId);
        }
    }

    /**
     * @dev adds a tokenId to an owner's indexed inventory
     */
    function _addTokenToOwnerIndex(address to, uint256 tokenId) private {
        _ownerTokenIndex[tokenId] = _ownerTokenIds[to].length;
        _ownerTokenIds[to].push(tokenId);
    }

    /**
     * @dev removes a tokenId from an owner's indexed inventory using swap-and-pop
     */
    function _removeTokenFromOwnerIndex(address from, uint256 tokenId) private {
        uint256 lastIndex = _ownerTokenIds[from].length - 1;
        uint256 tokenIndex = _ownerTokenIndex[tokenId];

        if (tokenIndex != lastIndex) {
            uint256 lastTokenId = _ownerTokenIds[from][lastIndex];
            _ownerTokenIds[from][tokenIndex] = lastTokenId;
            _ownerTokenIndex[lastTokenId] = tokenIndex;
        }

        _ownerTokenIds[from].pop();
        delete _ownerTokenIndex[tokenId];
    }

    // TOKEN URI

    /**
     * @dev delegates metadata rendering to the external tokenURI lens
     */
    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id); // revert if token does not exist
        require(TOKEN_URI_LENS != address(0), "URI");
        return ICoreTokenURILens(TOKEN_URI_LENS).tokenURI(id);
    }

    // PUBLIC VIEW METHODS

    /**
     * @dev returns true when a tokenId currently exists
     */
    function exists(uint256 id) external view returns (bool) {
    return _ownerOf(id) != address(0);
}

    /**
     * @dev returns the next tokenId to be minted
     */
    function nextId() external view returns (uint256) {
        return _nextId;
    }

    /**
     * @dev returns all currently owned tokenIds for a wallet from the owner index
     */
    function tokensOfOwner(address owner) public view returns (uint256[] memory) {
        require(owner != address(0), "OW0");
        return _ownerTokenIds[owner];
    }

    /**
     * @dev returns the tokenId owned by a wallet at a specific index
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256) {
        require(owner != address(0), "OW0");
        require(index < _ownerTokenIds[owner].length, "IDX");
        return _ownerTokenIds[owner][index];
    }

    /**
     * @dev returns the number of tokenIds owned by a wallet
     */
    function ownerTokenCount(address owner) external view returns (uint256) {
        require(owner != address(0), "OW0");
        return _ownerTokenIds[owner].length;
    }

    /**
     * @dev backwards-compatible alias for frontend inventory reads
     */
    function walletOfOwner(address owner) external view returns (uint256[] memory) {
        return tokensOfOwner(owner);
    }

    /**
     * @dev previews XNTD redeem output for an existing NFT
     */
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

    /**
     * @dev previews the result of enchanting two NFTs without changing state
     */
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

    /**
     * @dev returns full Core/Forged NFT state for one tokenId
     */
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

    /**
     * @dev returns full Core/Forged NFT state for multiple tokenIds
     */
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

    // XEN BURN CALLBACK
    /**
     * @dev callback required by XEN burn integration
     */
    function onTokenBurned(address, uint256) external view override {
    require(msg.sender == address(XEN), "XEN_CB");
}

    // ERC165 SUPPORT
    /**
     * @dev reports ERC165 support for the XEN burn callback interface
     */
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