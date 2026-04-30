// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * XNTDToken
 * - No owner, no admin.
 * - Mint is allowed ONLY for Core (xEnchantedNFT).
 * - Burn is standard ERC20Burnable (burn / burnFrom with allowance).
 */
contract XNTDToken is ERC20, ERC20Burnable {
    address public immutable CORE;

    modifier onlyCore() {
        require(msg.sender == CORE, "CORE");
        _;
    }

    constructor(address core) ERC20("xEnchanted Token", "XNTD") {
        require(core != address(0), "C0");
        CORE = core;
    }

    function mint(address to, uint256 amount) external onlyCore {
        _mint(to, amount);
    }
}