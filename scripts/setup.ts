/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
const { ethers } = hre;

// List of token addresses on testnet
const mockTokenBase = "0xaC9809c3cdBa4052F39501DEC700fc23776e40AF";
const mockTokenSepolia = "0x6c28de594318C8AB116Ad5865A7fc4b75a8e1dfe";
const mockTokenPolygon = "0x0B5d53E3b79e3317A17AD5F61910d4F807eCa56a";
const mockTokenBSC = "0x5Ce62153Cd1F7Da9099d81b58906C0843886dd5D";

// List of token addresses on mainnet
const NFTY_ETH = "0xe1d7c7a4596b038ced2a84bf65b8647271c53208";
const NFTY_POLYGON = "0xcc081220542a60a8ea7963c4f53d522b503272c1";
const NFTY_BSC = "0x5774b2fc3e91af89f89141eacf76545e74265982";
const MAG_BASE = "";

// List of bridge addresses on testnet
const bridgePolygon = "0xc02bdBEfcEeff5985664513f34a990c7CF54547F";
const bridgeBase = "0x2B7F14f2958b738D768b75cE3B57e1dcC13C7d8d";
const bridgeSepolia = "0x61CBae779BbC5Ede08C6010C1b0922523bA83Fc3";

const bridgeBSC = "0xaB2C4DAb32a8a07dD0403E23ab67b4E787270ace";

// List of bridge addresses on mainnet
const bridgePolygonMainnet = "";
const bridgeBaseMainnet = "";
const bridgeEthMainnet = "";
const bridgeBscMainnet = "";

import holdersBsc from "./snapshots/tokenHoldersBsc.json";
import holdersEth from "./snapshots/tokenHoldersEthereum.json";
import holdersPolygon from "./snapshots/tokenHoldersPolygon.json";

async function main() {
    const [deployer] = await ethers.getSigners();

    const [bridgeAddress, tokenAddress, networkName] = await getBridgeAddresses();
    const { whitelist: whitelist, allocations: allocations } = await getWhitelistWithAllocations(networkName);
    const { amountToSlice: amountToSlice } = await getStepsAmount(networkName);

    if (networkName != "BASE") {
        console.log(`Starting setup for NFTY bridge on ${networkName}`);

        const bridge = await ethers.getContractAt("NFTYBridge", bridgeAddress);

        if (whitelist.length > 450) {
            for (let i = 0; i <= whitelist.length; i += amountToSlice) {
                console.log("Adding whitelist addresses...");

                // Set whitelist addresses
                const whitelistTx = await bridge
                    .connect(deployer)
                    .setWhitelisted(whitelist.slice(i, i + amountToSlice), true);
                await whitelistTx.wait(1);

                console.log("Setting allocations...");

                // Set allocations
                const allocationsTx = await bridge
                    .connect(deployer)
                    .setAllocations(whitelist.slice(i, i + amountToSlice), allocations.slice(i, i + amountToSlice));
                await allocationsTx.wait(1);
            }
        } else {
            console.log("Adding whitelist addresses...");

            // Set whitelist addresses
            const whitelistTx = await bridge.connect(deployer).setWhitelisted(whitelist, true);
            await whitelistTx.wait(1);

            console.log("Setting allocations...");

            // Set allocations
            const allocationsTx = await bridge.connect(deployer).setAllocations(whitelist, allocations);
            await allocationsTx.wait(1);
        }

        console.log("Adding token...");

        // Add token
        // Uncomment next line if it is running on testnet, comment if not
        // await bridge.addToken(tokenAddress, mockTokenBase, 8n);
        // Uncomment next line if it is running on mainnet, uncomment if not
        await bridge.addToken(tokenAddress, MAG_BASE, 8n);

        console.log("Done!");
        console.log("==============================================");
    } else {
        console.log(`Starting setup for MAG bridge on ${networkName}`);

        const bridge = await ethers.getContractAt("MAGBridge", bridgeAddress);

        console.log("Adding token...");

        // Add token
        await bridge.addToken(tokenAddress, ethers.ZeroAddress, 8n);

        console.log("Done!");
        console.log("==============================================");
    }
}

async function getWhitelistWithAllocations(networkName: string) {
    const whitelist: string[] = [];
    const allocations: bigint[] = [];

    if (networkName == "ETH") {
        holdersEth.forEach((user) => {
            whitelist.push(user.walletAddress);
            allocations.push(ethers.toBigInt(user.balance));
        });

        return { whitelist, allocations };
    } else if (networkName == "POLYGON") {
        holdersPolygon.forEach((user) => {
            whitelist.push(user.walletAddress);
            allocations.push(ethers.toBigInt(user.balance));
        });

        return { whitelist, allocations };
    } else {
        holdersBsc.forEach((user) => {
            whitelist.push(user.walletAddress);
            allocations.push(ethers.toBigInt(user.balance));
        });
        return { whitelist, allocations };
    }
}

async function getStepsAmount(networkName: string) {
    const { whitelist: whitelist } = await getWhitelistWithAllocations(networkName);

    const holders = whitelist.length;
    const target = 450;
    let steps = 0;

    for (let i = target; i > 0; i--) {
        if (holders % i === 0 && holders / i <= target) {
            steps = i;
        }
    }

    const amountToSlice = holders / steps;
    return { amountToSlice, steps };
}

async function getBridgeAddresses() {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    if (chainId == 11155111n) {
        return [bridgeSepolia, mockTokenSepolia, "ETH"];
    } else if (chainId == 1n) {
        return [bridgeEthMainnet, NFTY_ETH, "ETH"];
    }

    if (chainId == 80002n) {
        return [bridgePolygon, mockTokenPolygon, "POLYGON"];
    } else if (chainId == 137n) {
        return [bridgePolygonMainnet, NFTY_POLYGON, "POLYGON"];
    }

    if (chainId == 97n) {
        return [bridgeBSC, mockTokenBSC, "BSC"];
    } else if (chainId == 56n) {
        return [bridgeBscMainnet, NFTY_BSC, "BSC"];
    }

    if (chainId == 84532n) {
        return [bridgeBase, mockTokenBase, "BASE"];
    } else {
        return [bridgeBaseMainnet, MAG_BASE, "BASE"];
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
