// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IxEnchantedStakeRead {
    function ownerOf(uint256 id) external view returns (address);

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

contract xEnchantedStakeTokenURILens {
    using Strings for uint256;

    IxEnchantedStakeRead public immutable STAKE;

    constructor(address stake) {
        require(stake != address(0), "S0");
        STAKE = IxEnchantedStakeRead(stake);
    }

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

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(json)
            )
        );
    }

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

    function previewExit(uint256 id)
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

    // ---- helpers ----

    function _u(uint256 x) internal pure returns (string memory) {
        return Strings.toString(x);
    }

    function _stakeAddress() internal view returns (string memory) {
        return Strings.toHexString(uint160(address(STAKE)), 20);
    }

    // ---- SVG ----

    function _svgBytes(uint256 id, P memory p) internal view returns (bytes memory) {
        string memory t = p.isForged ? "STAKED FORGED" : "STAKED ORIGINAL";
        string memory status = p.active ? (p.matured ? "MATURED" : "ACTIVE") : "INACTIVE";

        string memory statusColor =
            !p.active ? "#B8B8C8" :
            (p.matured ? "#77E38D" : "#6AA8FF");

        string memory typeColor = p.isForged ? "#F5C76A" : "#A0A0B8";

        bytes memory a = abi.encodePacked(
            "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='xMinYMin meet' viewBox='0 0 350 566'>",
                "<rect width='350' height='566' fill='#0B0B0F'/>",
                "<rect x='12' y='12' width='326' height='542' rx='10' fill='#12121A' stroke='#2A2A3A' stroke-width='2'/>",
                "<text x='175' y='44' dominant-baseline='hanging' text-anchor='middle' fill='#EAEAF2' font-size='20' font-family='monospace'>xEnchanted Stake</text>",
                "<text x='24' y='74' dominant-baseline='hanging' fill='#B8B8C8' font-size='14' font-family='monospace'>ID #", id.toString(), "</text>",
                "<line x1='24' y1='120' x2='326' y2='120' stroke='#2A2A3A' stroke-width='1'/>",
                "<text x='24' y='145' fill='", statusColor, "' font-size='14' font-family='monospace'>STATUS: ", status, "</text>",
                "<text x='24' y='182' fill='#EAEAF2' font-size='14' font-family='monospace'>ENDS_AT:</text>",
                "<text x='24' y='205' fill='#EAEAF2' font-size='14' font-family='monospace'>", _u(uint256(p.endTs)), "</text>"
        );

        bytes memory b = abi.encodePacked(
                "<text x='24' y='244' fill='#EAEAF2' font-size='14' font-family='monospace'>DURATION_DAYS: ", _u(uint256(p.durationDays)), "</text>",
                "<text x='24' y='278' fill='#EAEAF2' font-size='14' font-family='monospace'>TOTAL_APR_BPS: ", _u(uint256(p.totalAprBps)), "</text>",
                "<text x='24' y='312' fill='#9A9AB0' font-size='12' font-family='monospace'>BASE/LEVEL/FORGED: ",
                    _u(uint256(p.baseAprBps)), "/", _u(uint256(p.levelBonusBps)), "/", _u(uint256(p.forgedBonusBps)),
                "</text>",
                "<text x='24' y='345' fill='#EAEAF2' font-size='14' font-family='monospace'>LEVEL NFT: ", _u(uint256(p.level)), "</text>",
                "<text x='24' y='378' fill='", typeColor, "' font-size='14' font-family='monospace'>TYPE: ", t, "</text>",
                "<text x='24' y='412' fill='#EAEAF2' font-size='14' font-family='monospace'>NOMINAL:</text>",
                "<text x='24' y='434' fill='#EAEAF2' font-size='14' font-family='monospace'>", p.nominal.toString(), "</text>"
        );

        bytes memory c = abi.encodePacked(
                "<text x='24' y='468' fill='#9A9AB0' font-size='12' font-family='monospace'>EXPECTED_REWARD:</text>",
                "<text x='24' y='488' fill='#9A9AB0' font-size='12' font-family='monospace'>", p.expectedReward.toString(), "</text>",
                "<text x='24' y='511' fill='#9A9AB0' font-size='12' font-family='monospace'>AVAILABLE_REWARD: ", p.availableReward.toString(), "</text>",
                "<line x1='24' y1='536' x2='326' y2='536' stroke='#2A2A3A' stroke-width='1'/>",
                "<text x='30' y='540' dominant-baseline='hanging' fill='#6F6F86' font-size='9' font-family='monospace'>Contract: ",
                    _stakeAddress(),
                "</text>",
            "</svg>"
        );

        return abi.encodePacked(a, b, c);
    }

    // ---- JSON ----

    function _jsonBytes(uint256 id, P memory p, bytes memory svg) internal pure returns (bytes memory) {
        string memory status = p.active ? (p.matured ? "MATURED" : "ACTIVE") : "INACTIVE";
        string memory t = p.isForged ? "Staked Forged" : "Staked Original";
        string memory tokenName = p.isForged
            ? string(abi.encodePacked("xEnchanted Staked Forged #", id.toString()))
            : string(abi.encodePacked("xEnchanted Staked Original #", id.toString()));

        bytes memory img = abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(svg)
        );

        bytes memory a = abi.encodePacked(
            "{",
                "\"name\":\"", tokenName, "\",",
                "\"description\":\"Tradable xEnchanted stake position NFT. The current owner controls redeem and receives the recreated artifact plus any available reward. On-chain data is the source of truth.\",",
                "\"image\":\"", img, "\",",
                "\"attributes\":["
        );

        bytes memory b = abi.encodePacked(
                "{\"trait_type\":\"Status\",\"value\":\"", status, "\"},",
                "{\"trait_type\":\"EndsAt\",\"value\":\"", _u(uint256(p.endTs)), "\"},",
                "{\"trait_type\":\"DurationDays\",\"value\":\"", _u(uint256(p.durationDays)), "\"},",
                "{\"trait_type\":\"BaseAPR_BPS\",\"value\":\"", _u(uint256(p.baseAprBps)), "\"},",
                "{\"trait_type\":\"LevelBonus_BPS\",\"value\":\"", _u(uint256(p.levelBonusBps)), "\"},",
                "{\"trait_type\":\"ForgedBonus_BPS\",\"value\":\"", _u(uint256(p.forgedBonusBps)), "\"},",
                "{\"trait_type\":\"TotalAPR_BPS\",\"value\":\"", _u(uint256(p.totalAprBps)), "\"},",
                "{\"trait_type\":\"Level\",\"value\":\"", _u(uint256(p.level)), "\"},",
                "{\"trait_type\":\"Type\",\"value\":\"", t, "\"},"
        );

        bytes memory c = abi.encodePacked(
                "{\"trait_type\":\"Nominal\",\"value\":\"", p.nominal.toString(), "\"},",
                "{\"trait_type\":\"EarlyRedeemNominal\",\"value\":\"", p.earlyRedeemNominal.toString(), "\"},",
                "{\"trait_type\":\"MaturityRedeemNominal\",\"value\":\"", p.maturityRedeemNominal.toString(), "\"},",
                "{\"trait_type\":\"ExpectedReward\",\"value\":\"", p.expectedReward.toString(), "\"},",
                "{\"trait_type\":\"AvailableReward\",\"value\":\"", p.availableReward.toString(), "\"}",
                "]",
            "}"
        );

        return abi.encodePacked(a, b, c);
    }
}
