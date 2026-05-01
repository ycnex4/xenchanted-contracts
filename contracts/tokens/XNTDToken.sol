// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IXNTDBurnRedeemable is IERC165 {
    function onXNTDBurned(address user, uint256 amount) external;
}

/**
 * XNTDToken
 * - No owner, no admin.
 * - Mint is allowed ONLY for Core (xEnchantedNFT).
 * - No public self-burn: XNTD burn must have protocol meaning.
 * - XEN-style integrator burn: allowance + ERC165 callback.
 * - Forge burn path: one-time-bound Forge can burn user XNTD during forge without allowance.
 */
contract XNTDToken is ERC20 {
    address public immutable CORE;

    address public FORGE;
    bool public forgeBound;

    uint256 public totalBurned;
    uint256 public forgeBurned;

    mapping(address => uint256) public userBurns;
    mapping(address => uint256) public integratorBurns;

    enum BurnKind {
        Integrator,
        Forge
    }

    event ForgeBound(address indexed forge);
    event XNTDMinted(address indexed to, uint256 amount);
    event XNTDBurned(
        address indexed user,
        address indexed burner,
        uint256 amount,
        BurnKind kind
    );

    modifier onlyCore() {
        require(msg.sender == CORE, "CORE");
        _;
    }

    modifier onlyForge() {
        require(msg.sender == FORGE && FORGE != address(0), "FORGE");
        _;
    }

    constructor(address core) ERC20("xEnchanted Token", "XNTD") {
        require(core != address(0), "C0");
        CORE = core;
    }

    function mint(address to, uint256 amount) external onlyCore {
        _mint(to, amount);
        emit XNTDMinted(to, amount);
    }

    /// @notice One-time protocol binding. Only Core can bind Forge during Core.init(...).
    function bindForge(address forge_) external onlyCore {
        require(!forgeBound, "BOUND");
        require(forge_ != address(0), "F0");
        require(forge_.code.length != 0, "FCODE");

        FORGE = forge_;
        forgeBound = true;

        emit ForgeBound(forge_);
    }

    /**
     * @notice XEN-style proof-of-burn integration path.
     * @dev The caller must be a contract supporting IXNTDBurnRedeemable and must have allowance.
     *      This intentionally does NOT provide public self-burn.
     */
    function burn(address user, uint256 amount) external {
        require(user != address(0), "U0");
        require(amount != 0, "BURN_ZERO");
        require(_supportsBurnRedeemable(msg.sender), "BURNER");

        _spendAllowance(user, msg.sender, amount);
        _burn(user, amount);

        _recordBurn(user, msg.sender, amount, BurnKind.Integrator);
        integratorBurns[msg.sender] += amount;

        IXNTDBurnRedeemable(msg.sender).onXNTDBurned(user, amount);
    }

    /// @notice Forge-only protocol burn path. No allowance, no user-supplied burner.
    function burnForForge(address user, uint256 amount) external onlyForge {
        require(user != address(0), "U0");
        require(amount != 0, "BURN_ZERO");

        _burn(user, amount);

        forgeBurned += amount;
        _recordBurn(user, msg.sender, amount, BurnKind.Forge);
    }

    function _recordBurn(address user, address burner, uint256 amount, BurnKind kind) internal {
        userBurns[user] += amount;
        totalBurned += amount;

        emit XNTDBurned(user, burner, amount, kind);
    }

    function _supportsBurnRedeemable(address target) internal view returns (bool) {
        if (target.code.length == 0) return false;

        try IERC165(target).supportsInterface(type(IXNTDBurnRedeemable).interfaceId) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }
}
