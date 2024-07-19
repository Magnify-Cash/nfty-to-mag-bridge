/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
const { ethers } = hre;

// List of token addresses on mainnet
const NFTY_ETH = "0xe1d7c7a4596b038ced2a84bf65b8647271c53208";
const NFTY_POLYGON = "0xcc081220542a60a8ea7963c4f53d522b503272c1";
const NFTY_BSC = "0x5774b2fc3e91af89f89141eacf76545e74265982";
const MAG_BASE = "";

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

    if (chainId == 1n) {
        return [bridgeEthMainnet, NFTY_ETH, "ETH"];
    } else if (chainId == 137n) {
        return [bridgePolygonMainnet, NFTY_POLYGON, "POLYGON"];
    } else if (chainId == 56n) {
        return [bridgeBscMainnet, NFTY_BSC, "BSC"];
    } else {
        return [bridgeBaseMainnet, MAG_BASE, "BASE"];
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
