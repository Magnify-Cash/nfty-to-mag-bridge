// This is a script for deployment and automatically verification of all the contracts (`contracts/`).
import { ethers, upgrades, network } from "hardhat";
import { getAddressSaver, verify } from "./utils/helpers";
import path from "path";

import type { NFTYBridge } from "../../typechain-types";

const relayerAddress = "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE";
const FIVE_MINUTES = 300;

async function main() {
    const [deployer] = await ethers.getSigners();
    const [networkName, secondChainId] = await getNetworkName();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", networkName, "- Network name");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", secondChainId, "- Chain ID of other chain ");
    console.log("* ", relayerAddress, "- Address of the relayer");
    console.log("* ", FIVE_MINUTES, "- Minimum time to wait before refunding a transaction");
    console.log("\n --- ------- ---- --- ");

    // Deployment.
    const Bridge = await ethers.getContractFactory("NFTYBridge", deployer);
    const bridge = <NFTYBridge>(
        (<unknown>await upgrades.deployProxy(Bridge, [secondChainId, relayerAddress, FIVE_MINUTES, networkName]))
    );
    await bridge.waitForDeployment();

    const bridgeAddress = bridge.target.toString();

    console.log(`\`NFTY Bridge\` is deployed to ${bridgeAddress}`);
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");

    const saveAddress = getAddressSaver(addressesPath, network.name, true);
    saveAddress("NFTYBridge", bridgeAddress, false);

    console.log("Deployment is completed.");

    await verify(bridgeAddress, []);

    return bridge;
}

async function getNetworkName() {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    if (chainId == 11155111n) return ["ETH-", 11155111n];
    if (chainId == 1n) return ["ETH-", 8453n];

    if (chainId == 97n) return ["BSC-", 11155111n];
    if (chainId == 56n) return ["BSC-", 8453n];

    if (chainId == 80002n) return ["POLYGON-", 11155111n];
    if (chainId == 137n) return ["POLYGON-", 8453n];

    throw new Error("Network not supported");
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
