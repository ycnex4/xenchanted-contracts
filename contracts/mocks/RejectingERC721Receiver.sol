// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IMarketForRejectingReceiver {
    function list(uint256 tokenId, uint256 priceWei) external;

    function buy(uint256 listingId) external payable;

    function withdrawProceeds() external;
}

contract RejectingERC721Receiver is IERC721Receiver {
    error ERC721Rejected();
    error ETHRejected();

    function approveAndList(
        address core,
        address market,
        uint256 tokenId,
        uint256 priceWei
    ) external {
        IERC721(core).approve(market, tokenId);
        IMarketForRejectingReceiver(market).list(tokenId, priceWei);
    }

    function buy(address market, uint256 listingId) external payable {
        IMarketForRejectingReceiver(market).buy{value: msg.value}(listingId);
    }

    function withdrawFromMarket(address market) external {
        IMarketForRejectingReceiver(market).withdrawProceeds();
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        revert ERC721Rejected();
    }

    receive() external payable {
        revert ETHRejected();
    }
}
