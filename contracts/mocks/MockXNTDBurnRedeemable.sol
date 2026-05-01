// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IXNTDProofOfBurnToken {
    function burn(address user, uint256 amount) external;
}

interface IXNTDBurnRedeemableMock is IERC165 {
    function onXNTDBurned(address user, uint256 amount) external;
}

contract MockXNTDBurnRedeemable is IXNTDBurnRedeemableMock {
    IXNTDProofOfBurnToken public immutable XNTD;

    address public lastUser;
    uint256 public lastAmount;
    uint256 public callbackCount;

    event MockXNTDBurnCallback(address indexed user, uint256 amount);

    constructor(address xntd) {
        require(xntd != address(0), "T0");
        XNTD = IXNTDProofOfBurnToken(xntd);
    }

    function burnXNTD(address user, uint256 amount) external {
        XNTD.burn(user, amount);
    }

    function onXNTDBurned(address user, uint256 amount) external {
        require(msg.sender == address(XNTD), "T");

        lastUser = user;
        lastAmount = amount;
        callbackCount += 1;

        emit MockXNTDBurnCallback(user, amount);
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == type(IXNTDBurnRedeemableMock).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
