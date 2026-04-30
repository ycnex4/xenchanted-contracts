// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IxEnchantedStakeRead {
    function ownerOf(uint256 id) external view returns (address);

    struct NFTData {
        uint8   level;
        bool    isForged;
        uint64  createdAt;
        uint64  forgedAt;
        uint256 nominal;
        uint256 xenBurned;
        uint256 xntdBurned;
        uint256 parentId1;
        uint256 parentId2;
    }

    function pos(uint256 id)
        external
        view
        returns (
            NFTData memory snap,
            uint32 startTs,
            uint32 endTs,
            uint16 baseAprBps,
            bool active
        );

    function previewRedeem(uint256 id)
        external
        view
        returns (
            bool active,
            bool matured,
            uint32 startTs,
            uint32 endTs,
            uint16 baseAprBps,
            uint256 reward
        );
}

contract xEnchantedStakeTokenURILens {
    using Strings for uint256;

    IxEnchantedStakeRead public immutable STAKE;

    // keep in sync with Core protocol
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant EARLY_PENALTY_BPS = 100; // 1%

    constructor(address stake) {
        require(stake != address(0), "S0");
        STAKE = IxEnchantedStakeRead(stake);
    }

    struct P {
        bool active;
        bool matured;
        uint32 startTs;
        uint32 endTs;
        uint16 baseAprBps;
        uint256 reward;

        uint8 level;
        bool isForged;
        uint256 nominal;

        // strictly "if early" (when NOT matured). If matured -> 0 (not applicable).
        uint256 nominalIfEarly;
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

    // -------- stack-too-deep fix helpers --------

    function _previewActiveMaturedReward(uint256 id)
        internal
        view
        returns (bool activePrev, bool matured, uint256 reward)
    {
        (bool a, bool m, , , , uint256 r) = STAKE.previewRedeem(id);
        return (a, m, r);
    }

    // -------- loader --------

    function _load(uint256 id) internal view returns (P memory p) {
        (IxEnchantedStakeRead.NFTData memory snap, uint32 startTs, uint32 endTs, uint16 baseAprBps, bool activePos) =
            STAKE.pos(id);

        (bool activePrev, bool matured, uint256 reward) = _previewActiveMaturedReward(id);

        bool active = activePos && activePrev;

        p.active = active;
        p.matured = active ? matured : false;
        p.startTs = startTs;
        p.endTs = endTs;
        p.baseAprBps = baseAprBps;
        p.reward = (active && matured) ? reward : 0;

        p.level = snap.level;
        p.isForged = snap.isForged;
        p.nominal = snap.nominal;

        // "if early" is ONLY meaningful when active && !matured
        if (!active || matured) {
            p.nominalIfEarly = 0;
        } else {
            p.nominalIfEarly = (snap.nominal * (BPS_DENOM - EARLY_PENALTY_BPS)) / BPS_DENOM;
        }
    }

    function previewExit(uint256 id)
        external
        view
        returns (
            bool active,
            bool matured,
            uint32 startTs,
            uint32 endTs,
            uint16 baseAprBps,
            uint256 rewardIfMatured,
            uint256 nominalNow,
            uint256 nominalIfEarly
        )
    {
        (IxEnchantedStakeRead.NFTData memory snap, uint32 s, uint32 e, uint16 apr, bool activePos) =
            STAKE.pos(id);

        (bool activePrev, bool m, uint256 reward) = _previewActiveMaturedReward(id);

        active = activePos && activePrev;
        if (!active) {
            return (false, false, 0, 0, 0, 0, 0, 0);
        }

        startTs = s;
        endTs = e;
        baseAprBps = apr;
        matured = m;

        nominalNow = snap.nominal;

        // strictly early-only; if matured -> 0 (not applicable)
        nominalIfEarly = matured
            ? 0
            : (nominalNow * (BPS_DENOM - EARLY_PENALTY_BPS)) / BPS_DENOM;

        rewardIfMatured = matured ? reward : 0;

        return (true, matured, startTs, endTs, baseAprBps, rewardIfMatured, nominalNow, nominalIfEarly);
    }

    // ---- helpers ----

    function _u(uint256 x) internal pure returns (string memory) {
        return Strings.toString(x);
    }

    function _durDays(uint32 startTs, uint32 endTs) internal pure returns (string memory) {
        if (endTs <= startTs) return "0";
        return _u(uint256(endTs - startTs) / 1 days);
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

    string memory durDays = _durDays(p.startTs, p.endTs);

    bytes memory a = abi.encodePacked(
        "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='xMinYMin meet' viewBox='0 0 350 566'>",
            "<rect width='350' height='566' fill='#0B0B0F'/>",
            "<rect x='12' y='12' width='326' height='542' rx='10' fill='#12121A' stroke='#2A2A3A' stroke-width='2'/>",
            "<text x='175' y='44' dominant-baseline='hanging' text-anchor='middle' fill='#EAEAF2' font-size='20' font-family='monospace'>xEnchanted Stake</text>",
            "<text x='24' y='74' dominant-baseline='hanging' fill='#B8B8C8' font-size='14' font-family='monospace'>ID #", id.toString(), "</text>",
            "<line x1='24' y1='120' x2='326' y2='120' stroke='#2A2A3A' stroke-width='1'/>",
            "<text x='24' y='145' fill='", statusColor, "' font-size='14' font-family='monospace'>STATUS: ", status, "</text>",
            "<text x='24' y='185' fill='#EAEAF2' font-size='14' font-family='monospace'>ENDS_AT:</text>",
            "<text x='24' y='208' fill='#EAEAF2' font-size='14' font-family='monospace'>", _u(uint256(p.endTs)), "</text>"
    );

    bytes memory b = abi.encodePacked(
            "<text x='24' y='250' fill='#EAEAF2' font-size='14' font-family='monospace'>DURATION_DAYS: ", durDays, "</text>",
            "<text x='24' y='290' fill='#EAEAF2' font-size='14' font-family='monospace'>BASE_APR_BPS: ", _u(uint256(p.baseAprBps)), "</text>",
            "<text x='24' y='325' fill='#EAEAF2' font-size='14' font-family='monospace'>LEVEL NFT: ", _u(uint256(p.level)), "</text>",
            "<text x='24' y='360' fill='", typeColor, "' font-size='14' font-family='monospace'>TYPE: ", t, "</text>",
            "<text x='24' y='401' fill='#EAEAF2' font-size='14' font-family='monospace'>NOMINAL:</text>",
            "<text x='24' y='423' fill='#EAEAF2' font-size='14' font-family='monospace'>", p.nominal.toString(), "</text>"
    );

    bytes memory c = abi.encodePacked(
            "<text x='24' y='465' fill='#9A9AB0' font-size='12' font-family='monospace'>REWARD_IF_MATURED:</text>",
            "<text x='24' y='485' fill='#9A9AB0' font-size='12' font-family='monospace'>", p.reward.toString(), "</text>",
            "<line x1='24' y1='520' x2='326' y2='520' stroke='#2A2A3A' stroke-width='1'/>",
            "<text x='30' y='524' dominant-baseline='hanging' fill='#6F6F86' font-size='9' font-family='monospace'>Contract: ",
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
    string memory durDays = _durDays(p.startTs, p.endTs);

    bytes memory img = abi.encodePacked(
        "data:image/svg+xml;base64,",
        Base64.encode(svg)
    );

    bytes memory a = abi.encodePacked(
        "{",
            "\"name\":\"", tokenName, "\",",
            "\"description\":\"Tradable xEnchanted stake position NFT. On-chain data is the source of truth.\",",
            "\"image\":\"", img, "\",",
            "\"attributes\":["
    );

    bytes memory b = abi.encodePacked(
            "{\"trait_type\":\"Status\",\"value\":\"", status, "\"},",
            "{\"trait_type\":\"EndsAt\",\"value\":\"", _u(uint256(p.endTs)), "\"},",
            "{\"trait_type\":\"DurationDays\",\"value\":\"", durDays, "\"},",
            "{\"trait_type\":\"BaseAPR_BPS\",\"value\":\"", _u(uint256(p.baseAprBps)), "\"},",
            "{\"trait_type\":\"Level\",\"value\":\"", _u(uint256(p.level)), "\"},",
            "{\"trait_type\":\"Type\",\"value\":\"", t, "\"},"
    );

    bytes memory c = abi.encodePacked(
            "{\"trait_type\":\"Nominal\",\"value\":\"", p.nominal.toString(), "\"},",
            "{\"trait_type\":\"NominalIfEarly\",\"value\":\"", p.nominalIfEarly.toString(), "\"},",
            "{\"trait_type\":\"RewardIfMatured\",\"value\":\"", p.reward.toString(), "\"}",
            "]",
        "}"
    );

    return abi.encodePacked(a, b, c);
}
}