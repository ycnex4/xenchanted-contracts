// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @dev interface implemented by contracts that can receive XNTD burn callbacks
 */
interface IXNTDBurnRedeemable is IERC165 {
    /**
     * @dev called by XNTD after a supported integrator burn is completed
     */
    function onXNTDBurned(address user, uint256 amount) external;
}

/**
 * XNTDToken is the ERC20 token of the xEnchanted Crypto protocol.
 *
 * XNTD is minted only through protocol NFT mechanics controlled by Core.
 * The token has no owner mint path, no arbitrary admin emission and no
 * public self-burn path. Burns are tied to protocol mechanics or supported
 * integrator contracts.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */
contract XNTDToken is ERC20 {
    // IMMUTABLE PROTOCOL LINK

    address public immutable CORE;

    // ONE-TIME FORGE BINDING

    address public FORGE;
    bool public forgeBound;

    // PUBLIC BURN ACCOUNTING, READABLE VIA NAMESAKE GETTERS

    uint256 public totalBurned;
    uint256 public forgeBurned;

    mapping(address => uint256) public userBurns;
    mapping(address => uint256) public integratorBurns;

    // REENTRANCY GUARD FOR PUBLIC INTEGRATOR CALLBACK FLOW

    bool private _entered;

    modifier nonReentrant() {
        require(!_entered, "REENT");
        _entered = true;
        _;
        _entered = false;
    }

    // INTERNAL TYPE TO DESCRIBE XNTD BURN PROVENANCE

    enum BurnKind {
        Integrator,
        Forge
    }

    // EVENTS

    event ForgeBound(address indexed forge);
    event XNTDMinted(address indexed to, uint256 amount);
    event XNTDBurned(
        address indexed user,
        address indexed burner,
        uint256 amount,
        BurnKind kind
    );

    // MODIFIERS

    modifier onlyCore() {
        require(msg.sender == CORE, "CORE");
        _;
    }

    modifier onlyForge() {
        require(msg.sender == FORGE && FORGE != address(0), "FORGE");
        _;
    }

    // CONSTRUCTOR

    constructor(address core) ERC20("xEnchanted Token", "XNTD") {
        require(core != address(0), "C0");
        CORE = core;
    }

    // CORE-ONLY EMISSION

    /**
     * @dev mints XNTD only when called by Core as part of protocol NFT mechanics
     */
    function mint(address to, uint256 amount) external onlyCore {
        _mint(to, amount);
        emit XNTDMinted(to, amount);
    }

    // ADMINLESS ONE-TIME WIRING

    /**
     * @dev binds the Forge contract once so Forge can use its dedicated burn path
     */
    function bindForge(address forge_) external onlyCore {
        require(!forgeBound, "BOUND");
        require(forge_ != address(0), "F0");
        require(forge_.code.length != 0, "FCODE");

        FORGE = forge_;
        forgeBound = true;

        emit ForgeBound(forge_);
    }

    // PUBLIC INTEGRATOR BURN

    /**
     * @dev burns XNTD from a user through a supported integrator contract
     *
     * The caller must support the XNTD burn-redeemable interface.
     * The user must approve the caller before this function can spend and burn.
     * After burning, the caller receives an onXNTDBurned callback.
     *
     * The callback cannot re-enter XNTD while burn() is executing.
     * This is intentional: integrator callbacks are notification hooks,
     * not a place to perform nested XNTD operations.
     */
    function burn(address user, uint256 amount) external nonReentrant {
        require(user != address(0), "U0");
        require(amount != 0, "BURN_ZERO");
        require(_supportsBurnRedeemable(msg.sender), "BURNER");

        _spendAllowance(user, msg.sender, amount);
        _burn(user, amount);

        _recordBurn(user, msg.sender, amount, BurnKind.Integrator);
        integratorBurns[msg.sender] += amount;

        IXNTDBurnRedeemable(msg.sender).onXNTDBurned(user, amount);
    }

    // FORGE-ONLY PROTOCOL BURN

    /**
     * @dev burns XNTD for Forge without using the public integrator burn path
     *
     * This function can only be called by the bound Forge contract.
     * It exists to keep Forge as a direct protocol mechanic rather than
     * a generic third-party burn integration.
     */
    function burnForForge(address user, uint256 amount) external onlyForge {
        require(user != address(0), "U0");
        require(amount != 0, "BURN_ZERO");

        _burn(user, amount);

        forgeBurned += amount;
        _recordBurn(user, msg.sender, amount, BurnKind.Forge);
    }

    // INTERNAL ACCOUNTING

    /**
     * @dev records protocol burn provenance by user, caller and burn kind
     */
    function _recordBurn(address user, address burner, uint256 amount, BurnKind kind) internal {
        userBurns[user] += amount;
        totalBurned += amount;

        emit XNTDBurned(user, burner, amount, kind);
    }

    // INTERNAL INTEGRATOR CHECKS

    /**
     * @dev returns true when target is a contract supporting the XNTD burn callback interface
     */
    function _supportsBurnRedeemable(address target) internal view returns (bool) {
        if (target.code.length == 0) return false;

        try IERC165(target).supportsInterface(type(IXNTDBurnRedeemable).interfaceId) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }
}
