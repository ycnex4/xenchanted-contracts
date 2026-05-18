// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract XenchantedMarket is ReentrancyGuard, IERC721Receiver {
    IERC721 public immutable CORE;

    uint256 public constant MAX_PAGE_SIZE = 100;

    uint256 public nextListingId = 1;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceWei;
        bool active;
    }

    struct ListingView {
        uint256 listingId;
        address seller;
        uint256 tokenId;
        uint256 priceWei;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public activeListingIdByTokenId;

    uint256[] private _activeListingIds;
    mapping(uint256 => uint256) private _activeIndexPlusOne;

    mapping(address => uint256) public proceeds;
    uint256 public totalProceeds;

    bool private _listingTransfer;
    address private _expectedSeller;
    uint256 private _expectedTokenId;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 priceWei
    );

    event Cancelled(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId
    );

    event Sold(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenId,
        uint256 priceWei
    );

    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    error ZeroAddress();
    error NotContract();
    error NotERC721();
    error ZeroPrice();
    error NotOwner();
    error AlreadyListed();
    error NotActive();
    error NotSeller();
    error WrongValue();
    error SelfBuy();
    error NoFunds();
    error WithdrawFailed();
    error BadPageSize();
    error UnsupportedCollection();
    error DirectTransferRejected();
    error UnexpectedSeller();
    error UnexpectedToken();

    constructor(address core_) {
        if (core_ == address(0)) revert ZeroAddress();
        if (core_.code.length == 0) revert NotContract();

        bool ok = IERC165(core_).supportsInterface(type(IERC721).interfaceId);
        if (!ok) revert NotERC721();

        CORE = IERC721(core_);
    }

    function list(uint256 tokenId, uint256 priceWei) external nonReentrant {
        if (priceWei == 0) revert ZeroPrice();
        if (activeListingIdByTokenId[tokenId] != 0) revert AlreadyListed();
        if (CORE.ownerOf(tokenId) != msg.sender) revert NotOwner();

        _listingTransfer = true;
        _expectedSeller = msg.sender;
        _expectedTokenId = tokenId;

        CORE.safeTransferFrom(msg.sender, address(this), tokenId);

        uint256 listingId = nextListingId++;

        listings[listingId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            priceWei: priceWei,
            active: true
        });

        activeListingIdByTokenId[tokenId] = listingId;
        _addActiveListing(listingId);

        emit Listed(listingId, msg.sender, tokenId, priceWei);

        _listingTransfer = false;
        _expectedSeller = address(0);
        _expectedTokenId = 0;
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        if (!listing.active) revert NotActive();
        if (listing.seller != msg.sender) revert NotSeller();

        address seller = listing.seller;
        uint256 tokenId = listing.tokenId;

        _removeActiveListing(listingId);
        delete activeListingIdByTokenId[tokenId];
        listing.active = false;

        CORE.safeTransferFrom(address(this), seller, tokenId);

        emit Cancelled(listingId, seller, tokenId);
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];

        if (!listing.active) revert NotActive();
        if (msg.sender == listing.seller) revert SelfBuy();
        if (msg.value != listing.priceWei) revert WrongValue();

        address seller = listing.seller;
        uint256 tokenId = listing.tokenId;
        uint256 priceWei = listing.priceWei;

        _removeActiveListing(listingId);
        delete activeListingIdByTokenId[tokenId];
        listing.active = false;

        proceeds[seller] += msg.value;
        totalProceeds += msg.value;

        CORE.safeTransferFrom(address(this), msg.sender, tokenId);

        emit Sold(listingId, seller, msg.sender, tokenId, priceWei);
    }

    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        if (amount == 0) revert NoFunds();

        proceeds[msg.sender] = 0;
        totalProceeds -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();

        emit ProceedsWithdrawn(msg.sender, amount);
    }

    function activeListingCount() external view returns (uint256) {
        return _activeListingIds.length;
    }

    function getActiveListingIds(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        if (limit > MAX_PAGE_SIZE) revert BadPageSize();

        uint256 total = _activeListingIds.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 length = end - offset;
        ids = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            ids[i] = _activeListingIds[offset + i];
        }
    }

    function getActiveListings(
        uint256 offset,
        uint256 limit
    ) external view returns (ListingView[] memory result) {
        if (limit > MAX_PAGE_SIZE) revert BadPageSize();

        uint256 total = _activeListingIds.length;

        if (offset >= total) {
            return new ListingView[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 length = end - offset;
        result = new ListingView[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 listingId = _activeListingIds[offset + i];
            result[i] = _listingView(listingId);
        }
    }

    function getListing(
        uint256 listingId
    ) external view returns (ListingView memory) {
        return _listingView(listingId);
    }

    function getListingByTokenId(
        uint256 tokenId
    ) external view returns (ListingView memory) {
        uint256 listingId = activeListingIdByTokenId[tokenId];

        if (listingId == 0) {
            return
                ListingView({
                    listingId: 0,
                    seller: address(0),
                    tokenId: tokenId,
                    priceWei: 0,
                    active: false
                });
        }

        return _listingView(listingId);
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external view override returns (bytes4) {
        if (msg.sender != address(CORE)) revert UnsupportedCollection();
        if (!_listingTransfer) revert DirectTransferRejected();
        if (from != _expectedSeller) revert UnexpectedSeller();
        if (tokenId != _expectedTokenId) revert UnexpectedToken();

        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        revert DirectTransferRejected();
    }

    fallback() external payable {
        revert DirectTransferRejected();
    }

    function _listingView(
        uint256 listingId
    ) private view returns (ListingView memory) {
        Listing memory listing = listings[listingId];

        return
            ListingView({
                listingId: listingId,
                seller: listing.seller,
                tokenId: listing.tokenId,
                priceWei: listing.priceWei,
                active: listing.active
            });
    }

    function _addActiveListing(uint256 listingId) private {
        _activeListingIds.push(listingId);
        _activeIndexPlusOne[listingId] = _activeListingIds.length;
    }

    function _removeActiveListing(uint256 listingId) private {
        uint256 indexPlusOne = _activeIndexPlusOne[listingId];
        if (indexPlusOne == 0) revert NotActive();

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeListingIds.length - 1;

        if (index != lastIndex) {
            uint256 lastListingId = _activeListingIds[lastIndex];
            _activeListingIds[index] = lastListingId;
            _activeIndexPlusOne[lastListingId] = indexPlusOne;
        }

        _activeListingIds.pop();
        delete _activeIndexPlusOne[listingId];
    }
}
