// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * XenchantedMarket is the ETH-only secondary market for xEnchanted Core ERC721 NFTs.
 *
 * Market v1 supports escrow-based listings for Core NFT and Forged NFT because both
 * live in the same Core ERC721 contract. Stake NFTs are intentionally not supported:
 * they represent temporary protocol positions, not final market assets.
 *
 * The market has no admin, no fee, no pause, no upgrade path and no rescue functions.
 * Listed NFTs are held in escrow by this contract, while seller proceeds are stored
 * as pull payments and withdrawn by sellers after sale.
 *
 * Direct safeTransferFrom transfers are rejected by the manual ERC721 receiver guard.
 * Unsafe ERC721 transferFrom can bypass ERC721 receiver checks by design of ERC721;
 * such transfers are treated as documented technical user error and are not rescued
 * by this immutable no-admin market.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */
contract XenchantedMarket is ReentrancyGuard, IERC721Receiver {
    // IMMUTABLE PROTOCOL LINK

    IERC721 public immutable CORE;

    // PUBLIC CONSTANTS

    uint256 public constant MAX_PAGE_SIZE = 100;

    // PUBLIC LISTING STATE

    uint256 public nextListingId = 1;

    // INTERNAL TYPES

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

    // LISTING STORAGE
    // activeListingIdByTokenId[tokenId] == 0 means the token has no active listing.

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public activeListingIdByTokenId;

    // ACTIVE LISTING INDEX FOR FRONTEND PAGINATION
    // activeIndexPlusOne uses 1-based indexes so 0 can mean "not active".

    uint256[] private _activeListingIds;
    mapping(uint256 => uint256) private _activeIndexPlusOne;

    // PULL-PAYMENT ACCOUNTING
    // ETH is credited to sellers on buy() and withdrawn later through withdrawProceeds().
    // address(this).balance may be greater than totalProceeds only because of forced ETH.

    mapping(address => uint256) public proceeds;
    uint256 public totalProceeds;

    // ERC721 RECEIVER GUARD
    // These fields are set only during list() to accept exactly one expected Core NFT.

    bool private _listingTransfer;
    address private _expectedSeller;
    uint256 private _expectedTokenId;

    // EVENTS

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

    // ERRORS

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

    // CONSTRUCTOR

    constructor(address core_) {
        if (core_ == address(0)) revert ZeroAddress();
        if (core_.code.length == 0) revert NotContract();

        bool ok = IERC165(core_).supportsInterface(type(IERC721).interfaceId);
        if (!ok) revert NotERC721();

        CORE = IERC721(core_);
    }

    // PUBLIC STATE-CHANGING METHODS

    /**
     * @dev Lists a Core/Forged NFT by moving it into market escrow.
     *
     * The receiver guard is opened only for this exact seller and tokenId.
     * The listing is created after the escrow transfer succeeds; if any later
     * operation reverts, the whole transaction reverts including the NFT transfer.
     */
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

    /**
     * @dev Cancels an active listing and returns the NFT from escrow to the seller.
     */
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

    /**
     * @dev Buys an active listing for the exact listed ETH price.
     *
     * Proceeds are credited to the seller instead of being pushed during buy().
     * If the buyer cannot receive the ERC721 token, the transaction reverts and
     * the listing remains active because all state changes are rolled back.
     */
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

    /**
     * @dev Withdraws accumulated ETH sale proceeds for msg.sender.
     *
     * State is updated before the ETH call. If the ETH call fails, the whole
     * transaction reverts and the seller's proceeds are restored by EVM rollback.
     */
    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        if (amount == 0) revert NoFunds();

        proceeds[msg.sender] = 0;
        totalProceeds -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();

        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // PUBLIC VIEW METHODS

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

    // ERC721 RECEIVER

    /**
     * @dev Accepts only the expected Core NFT during list().
     *
     * This intentionally rejects direct safeTransferFrom transfers and all non-Core
     * ERC721 collections. The contract does not use ERC721Holder because a generic
     * holder would accept unsupported NFTs into an immutable no-rescue escrow.
     */
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

    // ETH RECEIVE GUARDS

    receive() external payable {
        revert DirectTransferRejected();
    }

    fallback() external payable {
        revert DirectTransferRejected();
    }

    // INTERNAL VIEW HELPERS

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

    // INTERNAL ACTIVE INDEX HELPERS

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
