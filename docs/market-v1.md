# xEnchanted Market v1

xEnchanted Market v1 is the first secondary-market contract for xEnchanted Crypto NFTs.

It is intentionally small, immutable, no-admin, ETH-only, and escrow-based.

## Scope

Market v1 supports secondary sales of NFTs from the Core ERC721 contract only:

- Core NFT;
- Forged NFT.

Both Core NFT and Forged NFT live in the same Core ERC721 contract. The market does not need a separate Forge collection address because Forge is a protocol module, not an ERC721 collection.

Market v1 does not support:

- Stake NFT;
- external ERC721 collections;
- arbitrary NFT custody;
- protocol fee collection;
- admin rescue;
- admin sweep;
- upgradeability;
- pause controls.

## Why Stake NFT are not listed

Stake NFT are intentionally excluded from Market v1.

A Stake NFT represents a temporary protocol position, not a final market asset. The underlying Core or Forged NFT is burned at stake start and restored through the Phoenix flow at redeem.

Listing Stake NFT directly would require the market and frontend to reason about:

- maturity;
- early redeem penalty;
- expected reward;
- available reward;
- current stake owner;
- position lifecycle;
- buyer expectations around redeem timing.

This adds complexity for a narrow use case.

The intended clean flow is:

    Stake NFT -> redeem -> restored Core/Forged NFT -> list on Market

Protocol Guide wording should follow this rule:

    Market v1 supports secondary sales of Core NFT and Forged NFT only.

    Stake NFT are not listed because they represent temporary protocol positions, not final market assets. After redeem, the restored Core or Forged NFT can be listed.

## ETH-only settlement

Market v1 uses ETH for settlement.

XNTD settlement was intentionally not included in v1 because early XNTD supply is expected to be scarce and protocol-useful. XNTD is needed for Forge, and an early XNTD-denominated marketplace would force users to choose between buying NFTs and preserving XNTD for protocol actions.

ETH-only settlement keeps v1 simple, familiar, and independent from the early XNTD liquidity cycle.

A future XNTD-based market can be considered separately as a new version.

## Escrow-based listing model

Market v1 is escrow-based.

When a seller lists an NFT:

    seller -> Market escrow

The NFT is physically held by the Market contract until either:

    cancel -> NFT returns to seller
    buy    -> NFT transfers to buyer

This avoids stale listings.

Approval-based markets were considered but rejected for v1 because they can create common failed-buy scenarios:

- seller transfers NFT away after listing;
- seller revokes approval;
- buyer tries to buy a listing that can no longer execute.

Escrow creates a simpler buyer experience: an active listing is backed by an NFT actually held by the market.

## Pull-payment proceeds

Market v1 does not push ETH to the seller during `buy()`.

Instead:

    buy() -> proceeds[seller] += price
    seller -> withdrawProceeds()
    anyone -> withdrawProceedsFor(seller)

This avoids coupling purchase execution to the seller's ability to receive ETH.
`withdrawProceedsFor(seller)` is a permissionless convenience helper. It is not an admin, rescue, or privileged path: anyone can trigger it, but ETH is always sent to `seller`, never to the caller unless the caller is also the seller.

Benefits:

- `buy()` does not fail because the seller is a contract wallet with restrictive receive logic;
- sellers can accumulate proceeds from multiple sales;
- withdrawal is explicit;
- proceeds accounting is easy to inspect;
- failed withdraw reverts and restores the seller's balance by EVM rollback.

## No fee

Market v1 has a 0% protocol fee.

There is no:

- fee receiver;
- treasury address;
- fee setter;
- owner;
- hidden extraction mechanism.

This matches the xEnchanted Crypto first-principles / no-admin model.

## No admin and no rescue

Market v1 has no admin role and no rescue functions.

There is no:

- owner;
- admin rescue;
- permissionless rescue;
- non-Core rescue;
- Core rescue;
- ETH sweep;
- arbitrary token sweep.

This is intentional.

A rescue function in an immutable no-admin escrow market can become a privileged or permissionless sweep surface. Since the market cannot reliably know the intended previous owner of an unsafe transfer, a rescue path could let third parties extract assets that were accidentally sent to the contract.

## ERC721 receiver guard

Market v1 implements `IERC721Receiver` manually.

It does not use OpenZeppelin `ERC721Holder`, because a generic holder accepts arbitrary ERC721 transfers.

The market accepts an ERC721 only when all of the following are true:

- `msg.sender == CORE`;
- the transfer is happening inside `list()`;
- `from == expected seller`;
- `tokenId == expected tokenId`.

This rejects:

- direct Core `safeTransferFrom` to the market;
- non-Core `safeTransferFrom` to the market;
- unexpected Core token transfers;
- unsupported ERC721 collections.

## Unsafe transferFrom limitation

ERC721 `transferFrom` does not call `onERC721Received`.

Because of that, a technical user can manually bypass the receiver guard by calling:

    CORE.transferFrom(user, market, tokenId)

This can send a Core NFT to the Market contract without creating a listing.

Market v1 treats this as documented technical user error.

The frontend must never use unsafe `transferFrom` for listing. The supported listing path is:

    approve Market -> Market.list(tokenId, priceWei)

There is intentionally no rescue function for this edge case.

## Main public API

State-changing methods:

    list(uint256 tokenId, uint256 priceWei)
    cancel(uint256 listingId)
    buy(uint256 listingId) payable
    withdrawProceeds()
    withdrawProceedsFor(address payable seller)

Read methods:

    activeListingCount()
    getActiveListingIds(uint256 offset, uint256 limit)
    getActiveListings(uint256 offset, uint256 limit)
    getListing(uint256 listingId)
    getListingByTokenId(uint256 tokenId)
    proceeds(address seller)
    totalProceeds()

Pagination is bounded by:

    MAX_PAGE_SIZE = 100

## Tested behavior

Local tests cover:

- constructor validation;
- immutable Core address;
- listing into escrow;
- cancel returning NFT to seller;
- buy transferring NFT to buyer;
- seller proceeds accounting;
- withdrawal of proceeds;
- failed withdrawal rollback;
- exact ETH payment requirement;
- overpayment rejection;
- self-buy rejection;
- inactive listing rejection;
- active listing pagination;
- active listing index removal;
- direct Core safe transfer rejection;
- non-Core safe transfer rejection;
- buyer contract rejecting ERC721 rollback;
- unsafe `transferFrom` documented edge case;
- listed NFT cannot be redeemed by seller;
- listed NFT cannot be staked by seller;
- listed NFT cannot be enchanted by seller.
- third party can withdraw proceeds for seller through `withdrawProceedsFor`;
- `withdrawProceedsFor` sends ETH to seller, not caller;
- failed `withdrawProceedsFor` rollback;

Latest local suite after Market v1:

    npx hardhat test -> 105 passing

## Deployment notes

Market v1 is independent from Core initialization.

Constructor:

    constructor(address core_)

Sepolia deploy/check scripts include Market deployment and read-only wiring checks:

- `Market.CORE == Core`;
- `Market.MAX_PAGE_SIZE == 100`;
- `Market.activeListingCount == 0`;
- `Market.nextListingId == 1`.

Mainnet deployment readiness should be updated separately before any mainnet deployment.
