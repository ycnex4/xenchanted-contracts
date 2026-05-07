// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @dev Minimal read interface used by the Stake tokenURI lens.
 *
 * Stake remains the source of truth. This lens only reads stake position
 * data and formats it into ERC721 metadata and SVG.
 */
interface IxEnchantedStakeRead {
    function ownerOf(uint256 id) external view returns (address);

    // PUBLIC VIEW TYPE RETURNED BY THE STAKE CONTRACT

    struct StakeView {
        uint256 tokenId;
        address owner;
        bool isForged;
        uint8 level;
        uint256 nominal;
        uint32 startTs;
        uint32 endTs;
        uint16 durationDays;
        bool active;
        bool matured;
        uint16 baseAprBps;
        uint16 levelBonusBps;
        uint16 forgedBonusBps;
        uint16 totalAprBps;
        uint256 expectedReward;
        uint256 availableReward;
        uint256 earlyRedeemNominal;
        uint256 maturityRedeemNominal;
    }

    function getStakeView(uint256 id) external view returns (StakeView memory);
}

/**
 * xEnchantedStakeTokenURILens generates metadata and SVG for Stake NFTs.
 *
 * It does not store protocol state. All stake position data is read from
 * xEnchantedStake, which remains the source of truth for active and matured
 * stake positions.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */
contract xEnchantedStakeTokenURILens {
    using Strings for uint256;

    // IMMUTABLE PROTOCOL LINK

    IxEnchantedStakeRead public immutable STAKE;

    // CONSTRUCTOR

    /**
     * @dev stores the Stake contract address used as the metadata source
     */
    constructor(address stake) {
        require(stake != address(0), "S0");
        STAKE = IxEnchantedStakeRead(stake);
    }

    // INTERNAL TYPE USED TO RENDER STAKE NFT METADATA

    struct P {
        bool active;
        bool matured;
        bool isForged;
        uint8 level;
        uint32 startTs;
        uint32 endTs;
        uint16 durationDays;
        uint16 baseAprBps;
        uint16 levelBonusBps;
        uint16 forgedBonusBps;
        uint16 totalAprBps;
        uint256 nominal;
        uint256 expectedReward;
        uint256 availableReward;
        uint256 earlyRedeemNominal;
        uint256 maturityRedeemNominal;
    }

    // TOKEN URI

    /**
     * @dev returns base64 encoded ERC721 metadata for a Stake NFT
     */
    function tokenURI(uint256 id) external view returns (string memory) {
        // Ensure token exists: ownerOf() reverts if not minted.
        // Use staticcall to avoid bubbling different revert strings from STAKE.
        (bool ok, bytes memory out) = address(STAKE).staticcall(
            abi.encodeWithSelector(IxEnchantedStakeRead.ownerOf.selector, id)
        );
        require(ok && out.length != 0, "NE");

        P memory p = _load(id);

        bytes memory svg = _svgBytes(id, p);
        bytes memory json = _jsonBytes(id, p, svg);

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(json)
                )
            );
    }

    /**
     * @dev loads the full stake position snapshot from the Stake contract
     */
    function _load(uint256 id) internal view returns (P memory p) {
        IxEnchantedStakeRead.StakeView memory v = STAKE.getStakeView(id);

        p.active = v.active;
        p.matured = v.matured;
        p.isForged = v.isForged;
        p.level = v.level;
        p.startTs = v.startTs;
        p.endTs = v.endTs;
        p.durationDays = v.durationDays;
        p.baseAprBps = v.baseAprBps;
        p.levelBonusBps = v.levelBonusBps;
        p.forgedBonusBps = v.forgedBonusBps;
        p.totalAprBps = v.totalAprBps;
        p.nominal = v.nominal;
        p.expectedReward = v.expectedReward;
        p.availableReward = v.availableReward;
        p.earlyRedeemNominal = v.earlyRedeemNominal;
        p.maturityRedeemNominal = v.maturityRedeemNominal;
    }

    // PUBLIC CONVENIENCE GETTERS

    /**
     * @dev returns the same exit preview values used by the Stake NFT metadata
     */
    function previewExit(
        uint256 id
    )
        external
        view
        returns (
            bool active,
            bool matured,
            uint32 startTs,
            uint32 endTs,
            uint16 durationDays,
            uint16 baseAprBps,
            uint16 levelBonusBps,
            uint16 forgedBonusBps,
            uint16 totalAprBps,
            uint256 nominal,
            uint256 expectedReward,
            uint256 availableReward,
            uint256 earlyRedeemNominal,
            uint256 maturityRedeemNominal
        )
    {
        IxEnchantedStakeRead.StakeView memory v = STAKE.getStakeView(id);

        return (
            v.active,
            v.matured,
            v.startTs,
            v.endTs,
            v.durationDays,
            v.baseAprBps,
            v.levelBonusBps,
            v.forgedBonusBps,
            v.totalAprBps,
            v.nominal,
            v.expectedReward,
            v.availableReward,
            v.earlyRedeemNominal,
            v.maturityRedeemNominal
        );
    }

    // INTERNAL FORMATTING HELPERS

    /**
     * @dev converts an unsigned integer to a decimal string
     */
    function _u(uint256 x) internal pure returns (string memory) {
        return Strings.toString(x);
    }

    /**
     * @dev returns the Stake contract address as a fixed-length hex string
     */
    function _stakeAddress() internal view returns (string memory) {
        return Strings.toHexString(uint160(address(STAKE)), 20);
    }

    /**
     * @dev formats whole numbers with comma separators for SVG readability
     */
    function _commas(uint256 value) internal pure returns (string memory) {
        string memory s = value.toString();
        bytes memory b = bytes(s);

        if (b.length <= 3) return s;

        uint256 commas = (b.length - 1) / 3;
        bytes memory out = new bytes(b.length + commas);

        uint256 j = out.length;
        uint256 group = 0;

        for (uint256 i = b.length; i > 0; --i) {
            if (group == 3) {
                out[--j] = ",";
                group = 0;
            }

            out[--j] = b[i - 1];
            ++group;
        }

        return string(out);
    }

    /**
     * @dev formats an 18-decimal token amount with up to two decimals
     */
    function _fmt18(
        uint256 amount,
        string memory symbol
    ) internal pure returns (string memory) {
        uint256 whole = amount / 1e18;
        uint256 frac2 = (amount % 1e18) / 1e16; // up to 2 decimals

        if (frac2 == 0) {
            return string(abi.encodePacked(_commas(whole), " ", symbol));
        }

        if (frac2 % 10 == 0) {
            return
                string(
                    abi.encodePacked(
                        _commas(whole),
                        ".",
                        (frac2 / 10).toString(),
                        " ",
                        symbol
                    )
                );
        }

        if (frac2 < 10) {
            return
                string(
                    abi.encodePacked(
                        _commas(whole),
                        ".0",
                        frac2.toString(),
                        " ",
                        symbol
                    )
                );
        }

        return
            string(
                abi.encodePacked(
                    _commas(whole),
                    ".",
                    frac2.toString(),
                    " ",
                    symbol
                )
            );
    }

    /**
     * @dev formats basis points as a human-readable APR percentage
     */
    function _fmtApr(uint256 bps) internal pure returns (string memory) {
        uint256 whole = bps / 100;
        uint256 frac = bps % 100;

        if (frac == 0) {
            return string(abi.encodePacked(whole.toString(), "%"));
        }

        if (frac % 10 == 0) {
            return
                string(
                    abi.encodePacked(
                        whole.toString(),
                        ".",
                        (frac / 10).toString(),
                        "%"
                    )
                );
        }

        if (frac < 10) {
            return
                string(
                    abi.encodePacked(
                        whole.toString(),
                        ".0",
                        frac.toString(),
                        "%"
                    )
                );
        }

        return
            string(
                abi.encodePacked(whole.toString(), ".", frac.toString(), "%")
            );
    }

    // SVG RENDERING

    /**
     * @dev renders the on-chain SVG image for Stake Core and Stake Forged NFTs
     */
    function _svgBytes(
        uint256 id,
        P memory p
    ) internal view returns (bytes memory) {
        string memory title = "xEnchanted Stake";
        string memory t = p.isForged ? "STAKE FORGED" : "STAKE CORE";
        string memory status = p.active
            ? (p.matured ? "MATURED" : "ACTIVE")
            : "INACTIVE";

        string memory bg = p.isForged ? "#1b1220" : "#130f24";
        string memory border = p.isForged ? "#f59e0b" : "#8b5cf6";
        string memory accent = "#a78bfa";

        string memory statusColor = !p.active
            ? "#B8B8C8"
            : (p.matured ? "#77E38D" : accent);

        bytes memory a = abi.encodePacked(
            "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='xMinYMin meet' viewBox='0 0 350 566'>",
            "<rect width='350' height='566' fill='",
            bg,
            "'/>",
            "<rect x='12' y='12' width='326' height='542' rx='10' fill='",
            bg,
            "' stroke='",
            border,
            "' stroke-width='2'/>",
            "<text x='175' y='42' dominant-baseline='hanging' text-anchor='middle' fill='",
            accent,
            "' font-size='20' font-family='monospace'>",
            title,
            "</text>",
            "<text x='24' y='82' dominant-baseline='hanging' fill='#EAEAF2' font-size='14' font-family='monospace'>ID #",
            id.toString(),
            "</text>",
            "<line x1='24' y1='122' x2='326' y2='122' stroke='",
            border,
            "' stroke-width='1'/>",
            "<text x='24' y='148' fill='",
            statusColor,
            "' font-size='14' font-family='monospace'>STATUS: ",
            status,
            "</text>",
            "<text x='24' y='172' fill='",
            accent,
            "' font-size='14' font-family='monospace'>TYPE: ",
            t,
            "</text>",
            "<text x='24' y='196' fill='#EAEAF2' font-size='14' font-family='monospace'>LEVEL: ",
            _u(uint256(p.level)),
            "</text>",
            "<text x='24' y='220' fill='#EAEAF2' font-size='14' font-family='monospace'>NOMINAL:</text>",
            "<text x='24' y='244' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            _fmt18(p.nominal, "XNTD"),
            "</text>"
        );

        bytes memory b = abi.encodePacked(
            "<text x='24' y='276' fill='#EAEAF2' font-size='14' font-family='monospace'>DURATION_DAYS: ",
            _u(uint256(p.durationDays)),
            "</text>",
            "<text x='24' y='312' fill='#EAEAF2' font-size='14' font-family='monospace'>TOTAL_APR: ",
            _fmtApr(uint256(p.totalAprBps)),
            "</text>",
            "<text x='24' y='336' fill='#B8B8C8' font-size='12' font-family='monospace'>BASE/LEVEL/FORGED: ",
            _fmtApr(uint256(p.baseAprBps)),
            " / ",
            _fmtApr(uint256(p.levelBonusBps)),
            " / ",
            _fmtApr(uint256(p.forgedBonusBps)),
            "</text>",
            "<text x='24' y='372' fill='#EAEAF2' font-size='14' font-family='monospace'>ENDS_AT:</text>",
            "<text x='24' y='396' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            _u(uint256(p.endTs)),
            "</text>"
        );

        bytes memory c = abi.encodePacked(
            "<text x='24' y='432' fill='#B8B8C8' font-size='12' font-family='monospace'>EXPECTED_REWARD:</text>",
            "<text x='24' y='452' fill='#B8B8C8' font-size='12' font-family='monospace'>",
            _fmt18(p.expectedReward, "XNTD"),
            "</text>",
            "<text x='24' y='472' fill='#B8B8C8' font-size='12' font-family='monospace'>AVAILABLE_REWARD: ",
            _fmt18(p.availableReward, "XNTD"),
            "</text>",
            "<text x='24' y='492' fill='#B8B8C8' font-size='11' font-family='monospace'>RETURN_EARLY: ",
            _fmt18(p.earlyRedeemNominal, "XNTD"),
            "</text>",
            "<text x='24' y='508' fill='#B8B8C8' font-size='11' font-family='monospace'>RETURN_MATURED: ",
            _fmt18(p.maturityRedeemNominal, "XNTD"),
            "</text>",
            "<line x1='24' y1='520' x2='326' y2='520' stroke='",
            border,
            "' stroke-width='1'/>",
            "<text x='30' y='524' dominant-baseline='hanging' fill='#B8B8C8' font-size='9' font-family='monospace'>Contract: ",
            _stakeAddress(),
            "</text>",
            "</svg>"
        );

        return abi.encodePacked(a, b, c);
    }

    // JSON METADATA

    /**
     * @dev builds ERC721 metadata JSON and embeds the SVG as base64 image data
     */
    function _jsonBytes(
        uint256 id,
        P memory p,
        bytes memory svg
    ) internal pure returns (bytes memory) {
        string memory status = p.active
            ? (p.matured ? "Matured" : "Active")
            : "Inactive";
        string memory t = p.isForged ? "Stake Forged" : "Stake Core";
        string memory tokenName = p.isForged
            ? string(
                abi.encodePacked("xEnchanted Stake Forged #", id.toString())
            )
            : string(
                abi.encodePacked("xEnchanted Stake Core #", id.toString())
            );

        bytes memory img = abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(svg)
        );

        bytes memory a = abi.encodePacked(
            "{",
            '"name":"',
            tokenName,
            '"',
            ',"description":"Tradable xEnchanted stake position NFT. The current owner controls redeem and receives the recreated NFT plus any available reward. On-chain data is the source of truth."',
            ',"image":"',
            img,
            '"',
            ',"attributes":['
        );

        bytes memory b = abi.encodePacked(
            '{"trait_type":"Status","value":"',
            status,
            '"},',
            '{"trait_type":"Type","value":"',
            t,
            '"},',
            '{"trait_type":"Level","value":"',
            _u(uint256(p.level)),
            '"},',
            '{"trait_type":"DurationDays","value":"',
            _u(uint256(p.durationDays)),
            '"},',
            '{"trait_type":"EndsAt","value":"',
            _u(uint256(p.endTs)),
            '"},',
            '{"trait_type":"BaseAPR","value":"',
            _fmtApr(uint256(p.baseAprBps)),
            '"},',
            '{"trait_type":"LevelBonusAPR","value":"',
            _fmtApr(uint256(p.levelBonusBps)),
            '"},',
            '{"trait_type":"ForgedBonusAPR","value":"',
            _fmtApr(uint256(p.forgedBonusBps)),
            '"},',
            '{"trait_type":"TotalAPR","value":"',
            _fmtApr(uint256(p.totalAprBps)),
            '"},'
        );

        bytes memory c = abi.encodePacked(
            '{"trait_type":"Nominal","value":"',
            _fmt18(p.nominal, "XNTD"),
            '"},',
            '{"trait_type":"ExpectedReward","value":"',
            _fmt18(p.expectedReward, "XNTD"),
            '"},',
            '{"trait_type":"AvailableReward","value":"',
            _fmt18(p.availableReward, "XNTD"),
            '"},',
            '{"trait_type":"EarlyRedeemNominal","value":"',
            _fmt18(p.earlyRedeemNominal, "XNTD"),
            '"},',
            '{"trait_type":"MaturityRedeemNominal","value":"',
            _fmt18(p.maturityRedeemNominal, "XNTD"),
            '"}',
            "]",
            "}"
        );

        return abi.encodePacked(a, b, c);
    }
}
