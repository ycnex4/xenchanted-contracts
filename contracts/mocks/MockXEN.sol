// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";

interface IBurnRedeemable {
    function onTokenBurned(address user, uint256 amount) external;
}

contract MockXEN is ERC20("Mock XEN", "mXEN") {
    // чтобы можно было проверить в тесте, что callback реально вызвался
    address public lastBurnUser;
    uint256 public lastBurnAmount;
    address public lastBurnCaller;

    constructor() {}

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address user, uint256 amount) external {
    // 1) EOA / no-code -> revert с понятной причиной
    require(msg.sender.code.length != 0, "Burn: not a supported contract");

    // 2) safe ERC165 check (не декодируем пустоту)
    (bool ok, bytes memory ret) = msg.sender.staticcall(
        abi.encodeWithSelector(IERC165.supportsInterface.selector, type(IBurnRedeemable).interfaceId)
    );
    require(ok && ret.length >= 32 && abi.decode(ret, (bool)), "Burn: not a supported contract");

    _burn(user, amount);

    IBurnRedeemable(msg.sender).onTokenBurned(user, amount);

    lastBurnCaller = msg.sender;
    lastBurnUser = user;
    lastBurnAmount = amount;
}
}