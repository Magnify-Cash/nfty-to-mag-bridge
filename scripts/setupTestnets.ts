/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
const { ethers } = hre;

// List of token addresses on testnet
const mockTokenBase = "0xaC9809c3cdBa4052F39501DEC700fc23776e40AF";
const mockTokenSepolia = "0x6c28de594318C8AB116Ad5865A7fc4b75a8e1dfe";
const mockTokenPolygon = "0x0B5d53E3b79e3317A17AD5F61910d4F807eCa56a";
const mockTokenBSC = "0x5Ce62153Cd1F7Da9099d81b58906C0843886dd5D";

// List of bridge addresses on testnet
const bridgePolygon = "0xe76a587296294211cbAE2A3Fefe83441E2a956A3";
const bridgeBase = "0x4a53821bFACE475420ce2c31470efbb44a645764";
const bridgeSepolia = "0xf98f635214a14610516423382D9bF562C5386512";
const bridgeBSC = "0xfB548718eCBa9Df6ddb67864F38Bf3decE9771e9";

import { addDec } from "../test/helpers";

const whitelist = [
    "0xe04Ccb301583eeE3cbCd271ed74E547F8271977b",
    "0x35c7371cdF8b8866b5Fd97e9A324F1821300B140",
    "0xF3Bc8C5F2A857d68D5809f02352C9d73656d74D4",
    "0x89758E3b31DdECaBdBFdf6416d153CE611DF903a",
    "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE",
    "0x6385597005A041Ad43Ef136e2a683E4469b1041A",
    "0xdEdecb49487AbD56aF4a99e2e3D4C63068658e23"
];
const allocations = [
    addDec(100_000),
    addDec(100_000),
    addDec(100_000),
    addDec(100_000),
    addDec(100_000),
    addDec(100_000),
    addDec(100_000)
];

const relayersNFTY = [
    "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE",
    "0x32E48Ddfb14c151111460B5fc54B70Ce44dE5e32",
    "0x44C02C88EE85fD7C2811e21911133D012B0E4144"
];

async function main() {
    const [deployer] = await ethers.getSigners();

    const [bridgeAddress, tokenAddress, networkName] = await getBridgeAddresses();

    if (networkName != "BASE") {
        console.log(`Starting setup for NFTY bridge on ${networkName}`);

        const bridge = await ethers.getContractAt("NFTYBridge", bridgeAddress);

        console.log("Adding whitelist addresses...");

        // Set whitelist addresses
        const whitelistTx = await bridge.connect(deployer).setWhitelisted(whitelist, true);
        await whitelistTx.wait(1);

        console.log("Setting allocations...");

        // Set allocations
        const allocationsTx = await bridge.connect(deployer).setAllocations(whitelist, allocations);
        await allocationsTx.wait(1);

        console.log("Adding token...");

        // Add token
        await bridge.addToken(tokenAddress, mockTokenBase, 8n);

        console.log("Done!");

        // Mint token to bridge
        console.log("Minting token to bridge...");
        const token = await ethers.getContractAt("MockToken", tokenAddress);
        await token.mintFor(bridgeAddress, addDec(1_000_000));

        // Grant relayer role
        console.log("Granting relayer role...");
        const role = await bridge.RELAYER_ROLE();
        const relayers = relayersNFTY;
        for (const relayer of relayers) {
            const grantTx = await bridge.connect(deployer).grantRole(role, relayer);
            await grantTx.wait(1);
        }

        console.log("==============================================");
    } else {
        console.log(`Starting setup for MAG bridge on ${networkName}`);

        const bridge = await ethers.getContractAt("MAGBridge", bridgeAddress);

        console.log("Grant relayer role...");

        const role = await bridge.RELAYER_ROLE();
        const relayers = [
            "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE",
            "0x320979D1E1Fd421e38A542f4B6a5c9A0551Bf032",
            "0x4430Fc96551CbD3035dEC91a17845E6E2112eC44"
        ];

        for (const relayer of relayers) {
            const grantTx = await bridge.connect(deployer).grantRole(role, relayer);
            await grantTx.wait(1);
        }

        console.log("Roles granted!");

        // Add token
        console.log("Adding token...");
        await bridge.addToken(tokenAddress, ethers.ZeroAddress, 8n);

        console.log("Done!");
        console.log("==============================================");
    }
}

async function getBridgeAddresses() {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    if (chainId == 11155111n) {
        return [bridgeSepolia, mockTokenSepolia, "ETH"];
    }

    if (chainId == 80002n) {
        return [bridgePolygon, mockTokenPolygon, "POLYGON"];
    }

    if (chainId == 97n) {
        return [bridgeBSC, mockTokenBSC, "BSC"];
    }

    if (chainId == 84532n) {
        return [bridgeBase, mockTokenBase, "BASE"];
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
