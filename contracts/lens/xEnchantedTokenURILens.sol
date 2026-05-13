// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @dev minimal Core read interface used by the token URI lens
 */
interface IxEnchantedNFTRead {
    // INTERNAL TYPE TO READ CORE NFT DATA FROM THE SOURCE CONTRACT
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

    function nftData(uint256 id) external view returns (NFTData memory);

    function ownerOf(uint256 id) external view returns (address);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);
}

/**
 * xEnchantedTokenURILens renders Core and Forged NFT metadata for the
 * xEnchanted Crypto protocol.
 *
 * Core remains the source of truth for NFT ownership and protocol state.
 * This lens stores no NFT lifecycle data and only turns Core data into
 * tokenURI JSON and on-chain SVG for wallets, explorers and frontends.
 *
 * Built by Algorithmic Mining Lab, an open community focused on
 * first-principles crypto and NFT-based algorithmic mining models.
 *
 * Author: Sergey Stepanenko.
 */
contract xEnchantedTokenURILens {
    using Strings for uint256;

    // IMMUTABLE SOURCE CONTRACT

    IxEnchantedNFTRead public immutable CORE;

    // CONSTRUCTOR

    /**
     * @dev binds the lens to the Core contract that provides NFT state
     */
    constructor(address core) {
        require(core != address(0), "C0");
        require(core.code.length != 0, "C_CODE");

        CORE = IxEnchantedNFTRead(core);
    }

    // INTERNAL TYPE TO RENDER TOKEN URI DATA

    struct P {
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

    // PUBLIC TOKEN URI METHOD

    /**
     * @dev returns base64 encoded ERC721 metadata with embedded SVG image
     */
    function tokenURI(uint256 id) external view returns (string memory) {
        // Existence check: ownerOf() reverts if the NFT does not exist.
        // Use staticcall to avoid bubbling different revert strings from CORE.
        (bool ok, bytes memory out) = address(CORE).staticcall(
            abi.encodeWithSelector(IxEnchantedNFTRead.ownerOf.selector, id)
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
     * @dev reads Core NFT data and copies it into a compact render struct
     */
    function _load(uint256 id) internal view returns (P memory p) {
        IxEnchantedNFTRead.NFTData memory d = CORE.nftData(id);

        p.level = d.level;
        p.isForged = d.isForged;
        p.createdAt = d.createdAt;
        p.forgedAt = d.forgedAt;
        p.nominal = d.nominal;
        p.xenBurned = d.xenBurned;
        p.xntdBurned = d.xntdBurned;
        p.parentId1 = d.parentId1;
        p.parentId2 = d.parentId2;
    }

    // INTERNAL RENDER HELPERS

    /**
     * @dev converts a uint256 value to string
     */
    function _u(uint256 x) internal pure returns (string memory) {
        return Strings.toString(x);
    }

    /**
     * @dev returns the bound Core address as a hex string
     */
    function _coreAddress() internal view returns (string memory) {
        return Strings.toHexString(uint160(address(CORE)), 20);
    }

    /**
     * @dev formats whole-number values with comma separators for readability
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
     * @dev formats 18-decimal token amounts into compact human-readable text
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
     * @dev renders a subtle punch-card inspired background texture
     */
    function _punchCardLayer(
        string memory ink
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                "<g fill='",
                ink,
                "' font-family='monospace'>",
                "<rect x='139' y='546' width='5' height='11' rx='1' fill-opacity='.088'/>",
                "<text x='156' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.05'>9</text>",
                "<text x='170' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.05'>9</text>",
                "<rect x='181' y='546' width='5' height='11' rx='1' fill-opacity='.094'/>",
                "<text x='198' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.052'>9</text>",
                "<rect x='209' y='546' width='5' height='11' rx='1' fill-opacity='.10'/>",
                "<rect x='223' y='546' width='5' height='11' rx='1' fill-opacity='.103'/>",
                "<text x='240' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.055'>9</text>",
                "<rect x='251' y='546' width='5' height='11' rx='1' fill-opacity='.106'/>",
                "<text x='268' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.058'>9</text>",
                "<rect x='279' y='546' width='5' height='11' rx='1' fill-opacity='.109'/>",
                "<text x='296' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.06'>9</text>",
                "<rect x='307' y='546' width='5' height='11' rx='1' fill-opacity='.114'/>",
                "<text x='324' y='552' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.062'>9</text>",
                "<text x='156' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.048'>8</text>",
                "<text x='170' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.048'>8</text>",
                "<rect x='181' y='524' width='5' height='11' rx='1' fill-opacity='.082'/>",
                "<text x='198' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.05'>8</text>",
                "<rect x='209' y='524' width='5' height='11' rx='1' fill-opacity='.088'/>",
                "<text x='226' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.052'>8</text>",
                "<rect x='237' y='524' width='5' height='11' rx='1' fill-opacity='.091'/>",
                "<text x='254' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.054'>8</text>",
                "<rect x='265' y='524' width='5' height='11' rx='1' fill-opacity='.095'/>",
                "<text x='282' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.056'>8</text>",
                "<rect x='293' y='524' width='5' height='11' rx='1' fill-opacity='.102'/>",
                "<text x='310' y='530' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.058'>8</text>",
                "<rect x='321' y='524' width='5' height='11' rx='1' fill-opacity='.108'/>",
                "<rect x='181' y='502' width='5' height='11' rx='1' fill-opacity='.075'/>",
                "<text x='198' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.045'>7</text>",
                "<text x='212' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.045'>7</text>",
                "<rect x='223' y='502' width='5' height='11' rx='1' fill-opacity='.082'/>",
                "<text x='240' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.05'>7</text>",
                "<rect x='251' y='502' width='5' height='11' rx='1' fill-opacity='.09'/>",
                "<text x='268' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.055'>7</text>",
                "<rect x='279' y='502' width='5' height='11' rx='1' fill-opacity='.098'/>",
                "<text x='296' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.06'>7</text>",
                "<rect x='307' y='502' width='5' height='11' rx='1' fill-opacity='.108'/>",
                "<text x='324' y='508' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.06'>7</text>",
                "<text x='198' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.04'>6</text>",
                "<rect x='209' y='480' width='5' height='11' rx='1' fill-opacity='.065'/>",
                "<text x='226' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.04'>6</text>",
                "<text x='240' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.04'>6</text>",
                "<rect x='251' y='480' width='5' height='11' rx='1' fill-opacity='.072'/>",
                "<text x='268' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.045'>6</text>",
                "<text x='282' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.045'>6</text>",
                "<rect x='293' y='480' width='5' height='11' rx='1' fill-opacity='.082'/>",
                "<text x='310' y='486' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.05'>6</text>",
                "<rect x='321' y='480' width='5' height='11' rx='1' fill-opacity='.088'/>",
                "<text x='212' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.036'>5</text>",
                "<rect x='223' y='458' width='5' height='11' rx='1' fill-opacity='.058'/>",
                "<text x='240' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.038'>5</text>",
                "<text x='254' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.038'>5</text>",
                "<rect x='265' y='458' width='5' height='11' rx='1' fill-opacity='.065'/>",
                "<text x='282' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.042'>5</text>",
                "<text x='296' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.042'>5</text>",
                "<rect x='307' y='458' width='5' height='11' rx='1' fill-opacity='.072'/>",
                "<text x='324' y='464' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.045'>5</text>",
                "<text x='226' y='442' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.033'>4</text>",
                "<rect x='237' y='436' width='5' height='11' rx='1' fill-opacity='.052'/>",
                "<text x='254' y='442' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.035'>4</text>",
                "<rect x='265' y='436' width='5' height='11' rx='1' fill-opacity='.058'/>",
                "<rect x='279' y='436' width='5' height='11' rx='1' fill-opacity='.062'/>",
                "<text x='296' y='442' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.038'>4</text>",
                "<rect x='307' y='436' width='5' height='11' rx='1' fill-opacity='.068'/>",
                "<text x='324' y='442' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.04'>4</text>",
                "<text x='240' y='420' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.03'>3</text>",
                "<rect x='251' y='414' width='5' height='11' rx='1' fill-opacity='.048'/>",
                "<text x='268' y='420' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.032'>3</text>",
                "<text x='282' y='420' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.032'>3</text>",
                "<rect x='293' y='414' width='5' height='11' rx='1' fill-opacity='.055'/>",
                "<text x='310' y='420' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.035'>3</text>",
                "<rect x='321' y='414' width='5' height='11' rx='1' fill-opacity='.06'/>",
                "<text x='254' y='398' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.028'>2</text>",
                "<rect x='265' y='392' width='5' height='11' rx='1' fill-opacity='.044'/>",
                "<text x='282' y='398' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.03'>2</text>",
                "<rect x='293' y='392' width='5' height='11' rx='1' fill-opacity='.05'/>",
                "<rect x='307' y='392' width='5' height='11' rx='1' fill-opacity='.054'/>",
                "<text x='324' y='398' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.033'>2</text>",
                "<text x='268' y='376' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.026'>1</text>",
                "<rect x='279' y='370' width='5' height='11' rx='1' fill-opacity='.04'/>",
                "<text x='296' y='376' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.028'>1</text>",
                "<text x='310' y='376' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.028'>1</text>",
                "<rect x='321' y='370' width='5' height='11' rx='1' fill-opacity='.046'/>",
                "<text x='282' y='364' text-anchor='middle' dominant-baseline='middle' font-size='5' fill-opacity='.024'>43</text>",
                "<text x='296' y='364' text-anchor='middle' dominant-baseline='middle' font-size='5' fill-opacity='.024'>44</text>",
                "<text x='310' y='364' text-anchor='middle' dominant-baseline='middle' font-size='5' fill-opacity='.024'>45</text>",
                "<text x='324' y='364' text-anchor='middle' dominant-baseline='middle' font-size='5' fill-opacity='.024'>46</text>",
                "<text x='282' y='354' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.024'>0</text>",
                "<text x='296' y='354' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.024'>0</text>",
                "<rect x='307' y='348' width='5' height='11' rx='1' fill-opacity='.038'/>",
                "<text x='324' y='354' text-anchor='middle' dominant-baseline='middle' font-size='10' fill-opacity='.026'>0</text>",
                "</g>"
            );
    }

    // SVG RENDERING

    /**
     * @dev renders a lightweight on-chain SVG for Core and Forged NFTs
     */
    function _svgBytes(
        uint256 id,
        P memory p
    ) internal view returns (bytes memory) {
        string memory title = p.isForged
            ? "xEnchanted Forged"
            : "xEnchanted Core";
        string memory t = p.isForged ? "FORGED" : "CORE";

        string memory bg = p.isForged ? "#211607" : "#071824";
        string memory border = p.isForged ? "#f59e0b" : "#38bdf8";
        string memory accent = p.isForged ? "#fbbf24" : "#22d3ee";

        string memory burnLabel = p.isForged
            ? "XNTD_BURNED:"
            : "XEN_TOTAL_BURNED:";
        string memory burnValue = p.isForged
            ? _fmt18(p.xntdBurned, "XNTD")
            : _fmt18(p.xenBurned, "XEN");

        string memory tsLabel = p.isForged ? "FORGED_AT:" : "CREATED_AT:";
        string memory tsValue = p.isForged
            ? _u(uint256(p.forgedAt))
            : _u(uint256(p.createdAt));

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
            _punchCardLayer(accent),
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
            "<text x='24' y='152' fill='",
            accent,
            "' font-size='14' font-family='monospace'>TYPE: ",
            t,
            "</text>",
            "<text x='24' y='188' fill='#EAEAF2' font-size='14' font-family='monospace'>LEVEL: ",
            _u(uint256(p.level)),
            "</text>",
            "<text x='24' y='224' fill='#EAEAF2' font-size='14' font-family='monospace'>NOMINAL:</text>",
            "<text x='24' y='248' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            _fmt18(p.nominal, "XNTD"),
            "</text>"
        );

        bytes memory b = abi.encodePacked(
            "<text x='24' y='292' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            burnLabel,
            "</text>",
            "<text x='24' y='316' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            burnValue,
            "</text>",
            "<text x='24' y='360' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            tsLabel,
            "</text>",
            "<text x='24' y='384' fill='#EAEAF2' font-size='14' font-family='monospace'>",
            tsValue,
            "</text>"
        );

        bytes memory c = abi.encodePacked(
            "<text x='24' y='458' fill='#B8B8C8' font-size='12' font-family='monospace'>PARENT1: ",
            p.parentId1.toString(),
            "</text>",
            "<text x='24' y='482' fill='#B8B8C8' font-size='12' font-family='monospace'>PARENT2: ",
            p.parentId2.toString(),
            "</text>",
            "<line x1='24' y1='520' x2='326' y2='520' stroke='",
            border,
            "' stroke-width='1'/>",
            "<text x='30' y='524' dominant-baseline='hanging' fill='#B8B8C8' font-size='10' font-family='monospace'>Contract: ",
            _coreAddress(),
            "</text>",
            "</svg>"
        );

        return bytes.concat(a, b, c);
    }

    // JSON METADATA RENDERING

    /**
     * @dev renders ERC721 metadata JSON and embeds the SVG image as base64
     */
    function _jsonBytes(
        uint256 id,
        P memory p,
        bytes memory svg
    ) internal view returns (bytes memory) {
        string memory tokenName = p.isForged
            ? string(abi.encodePacked("xEnchanted Forged #", id.toString()))
            : string(abi.encodePacked("xEnchanted Core #", id.toString()));

        string memory t = p.isForged ? "Forged" : "Core";

        string memory burnTrait = p.isForged
            ? "XNTD_BURNED"
            : "XEN_TOTAL_BURNED";
        string memory burnVal = p.isForged
            ? _fmt18(p.xntdBurned, "XNTD")
            : _fmt18(p.xenBurned, "XEN");

        string memory tsTrait = p.isForged ? "ForgedAt" : "CreatedAt";
        string memory tsVal = p.isForged
            ? _u(uint256(p.forgedAt))
            : _u(uint256(p.createdAt));

        bytes memory img = abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(svg)
        );

        bytes memory a = abi.encodePacked(
            "{",
            '"name":"',
            tokenName,
            '"',
            ',"description":"',
            (p.isForged ? "xEnchanted forged NFT." : "xEnchanted core NFT."),
            ' On-chain data is the source of truth."',
            ',"image":"',
            img,
            '"',
            ',"attributes":['
        );

        bytes memory b = abi.encodePacked(
            '{"trait_type":"Type","value":"',
            t,
            '"},',
            '{"trait_type":"Level","value":"',
            _u(uint256(p.level)),
            '"},',
            '{"trait_type":"Nominal","value":"',
            _fmt18(p.nominal, "XNTD"),
            '"},',
            '{"trait_type":"',
            burnTrait,
            '","value":"',
            burnVal,
            '"},',
            '{"trait_type":"',
            tsTrait,
            '","value":"',
            tsVal,
            '"},'
        );

        bytes memory c = abi.encodePacked(
            '{"trait_type":"Parent1","value":"',
            p.parentId1.toString(),
            '"},',
            '{"trait_type":"Parent2","value":"',
            p.parentId2.toString(),
            '"},',
            '{"trait_type":"Contract","value":"',
            _coreAddress(),
            '"}',
            "]",
            "}"
        );

        return bytes.concat(a, b, c);
    }
}
