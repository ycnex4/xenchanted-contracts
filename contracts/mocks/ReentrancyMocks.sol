// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IReentrancyBurnRedeemable {
    function onTokenBurned(address user, uint256 amount) external;
}

interface IReentrancyCoreMint {
    function mintWithXEN() external;
}

interface IReentrancyStakeTarget {
    function stake(uint256 id, uint16 durationDays) external;
}

interface IReentrancyMarketTarget {
    function list(uint256 tokenId, uint256 priceWei) external;
}

/**
 * @dev Test-only XEN mock that attempts to reenter Core.mintWithXEN()
 * during the XEN burn path.
 */
contract ReentrantXEN is ERC20("Reentrant XEN", "rXEN") {
    address public lastBurnUser;
    uint256 public lastBurnAmount;
    address public lastBurnCaller;

    bool public reentryEnabled = true;
    bool public reentryAttempted;
    bool public reentryBlocked;
    bool public reentrySucceeded;

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setReentryEnabled(bool enabled) external {
        reentryEnabled = enabled;
    }

    function burn(address user, uint256 amount) external {
        require(user != address(0), "U0");
        require(amount != 0, "BURN_ZERO");
        require(msg.sender.code.length != 0, "Burn: not a supported contract");

        (bool ok, bytes memory ret) = msg.sender.staticcall(
            abi.encodeWithSelector(
                IERC165.supportsInterface.selector,
                type(IReentrancyBurnRedeemable).interfaceId
            )
        );

        require(
            ok && ret.length >= 32 && abi.decode(ret, (bool)),
            "Burn: not a supported contract"
        );

        _spendAllowance(user, msg.sender, amount);
        _burn(user, amount);

        if (reentryEnabled) {
            reentryAttempted = true;

            try IReentrancyCoreMint(msg.sender).mintWithXEN() {
                reentrySucceeded = true;
            } catch {
                reentryBlocked = true;
            }
        }

        IReentrancyBurnRedeemable(msg.sender).onTokenBurned(user, amount);

        lastBurnCaller = msg.sender;
        lastBurnUser = user;
        lastBurnAmount = amount;
    }
}

/**
 * @dev Test-only Core replacement for xEnchantedStake.
 * It attempts to reenter Stake.stake() during burnForStaking().
 */
contract ReentrantStakeCore is IERC165 {
    struct NFTData {
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

    address public stakeTarget;
    uint256 public reentryTokenId = 2;

    bool public reentryEnabled = true;
    bool public reentryAttempted;
    bool public reentryBlocked;
    bool public reentrySucceeded;

    function supportsInterface(bytes4) external pure override returns (bool) {
        return true;
    }

    function setStakeTarget(address target) external {
        stakeTarget = target;
    }

    function setReentryTokenId(uint256 tokenId) external {
        reentryTokenId = tokenId;
    }

    function setReentryEnabled(bool enabled) external {
        reentryEnabled = enabled;
    }

    function baseAprBpsNow() external pure returns (uint16) {
        return 1000;
    }

    function burnForStaking(
        uint256,
        address ownerExpected
    ) external returns (NFTData memory snap) {
        require(ownerExpected != address(0), "OS");

        if (reentryEnabled && stakeTarget != address(0)) {
            reentryAttempted = true;

            try IReentrancyStakeTarget(stakeTarget).stake(reentryTokenId, 30) {
                reentrySucceeded = true;
            } catch {
                reentryBlocked = true;
            }
        }

        snap = NFTData({
            level: 2,
            isForged: false,
            createdAt: uint64(block.timestamp),
            forgedAt: 0,
            nominal: 300 ether,
            xenBurned: 20 ether,
            xntdBurned: 0,
            parentId1: 1,
            parentId2: 2
        });
    }
}

/**
 * @dev Test-only ERC721-like Core replacement for XenchantedMarket.
 * It attempts to reenter Market.list() during safeTransferFrom().
 */
contract ReentrantMarketCore is IERC165 {
    string public constant name = "Reentrant Market Core";
    string public constant symbol = "RMC";

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;

    uint256 public nextTokenId = 1;

    address public marketTarget;
    uint256 public reentryTokenId;
    uint256 public reentryPriceWei = 1 ether;

    bool public reentryEnabled = true;
    bool public reentryAttempted;
    bool public reentryBlocked;
    bool public reentrySucceeded;

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f; // ERC721Metadata
    }

    function setMarketTarget(address target) external {
        marketTarget = target;
    }

    function setReentryTokenId(uint256 tokenId) external {
        reentryTokenId = tokenId;
    }

    function setReentryPriceWei(uint256 priceWei) external {
        reentryPriceWei = priceWei;
    }

    function setReentryEnabled(bool enabled) external {
        reentryEnabled = enabled;
    }

    function mint(address to) external returns (uint256 tokenId) {
        require(to != address(0), "ZERO");

        tokenId = nextTokenId++;
        _owners[tokenId] = to;
        _balances[to] += 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "ZERO");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "NO_TOKEN");
        return owner;
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        _tokenApprovals[tokenId] = to;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "NO_TOKEN");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function setApprovalForAll(address, bool) external pure {
        revert("NO_OPERATOR_APPROVAL");
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        _transferFrom(from, to, tokenId, false);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external {
        _transferFrom(from, to, tokenId, true);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata
    ) external {
        _transferFrom(from, to, tokenId, true);
    }

    function _transferFrom(
        address from,
        address to,
        uint256 tokenId,
        bool safe
    ) internal {
        require(to != address(0), "ZERO_TO");
        require(ownerOf(tokenId) == from, "FROM");
        require(
            msg.sender == from || _tokenApprovals[tokenId] == msg.sender,
            "NOT_AUTH"
        );

        if (reentryEnabled && marketTarget != address(0)) {
            reentryAttempted = true;

            try
                IReentrancyMarketTarget(marketTarget).list(
                    reentryTokenId,
                    reentryPriceWei
                )
            {
                reentrySucceeded = true;
            } catch {
                reentryBlocked = true;
            }
        }

        _tokenApprovals[tokenId] = address(0);
        _owners[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;

        if (safe && to.code.length != 0) {
            bytes4 retval = IERC721Receiver(to).onERC721Received(
                msg.sender,
                from,
                tokenId,
                ""
            );

            require(
                retval == IERC721Receiver.onERC721Received.selector,
                "UNSAFE_RECEIVER"
            );
        }
    }
}
