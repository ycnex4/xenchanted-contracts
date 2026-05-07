// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../core/xEnchantedNFT.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IxEnchantedNFTRead {
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

contract xEnchantedTokenURILens {
    using Strings for uint256;

    IxEnchantedNFTRead public immutable CORE;

    constructor(address core) {
        require(core != address(0), "C0");
        CORE = IxEnchantedNFTRead(core);
    }

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

    // ---- helpers ----

    function _u(uint256 x) internal pure returns (string memory) {
        return Strings.toString(x);
    }

    function _coreAddress() internal view returns (string memory) {
        return Strings.toHexString(uint160(address(CORE)), 20);
    }

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

    // ---- SVG ----

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
            "<text x='30' y='524' dominant-baseline='hanging' fill='#B8B8C8' font-size='9' font-family='monospace'>Contract: ",
            _coreAddress(),
            "</text>",
            "</svg>"
        );

        return abi.encodePacked(a, b, c);
    }

    // ---- JSON ----

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

        return abi.encodePacked(a, b, c);
    }
}
