// This is a script for deployment and automatically verification of all the contracts (`contracts/`).
import { ethers, upgrades, network } from "hardhat";
import { getAddressSaver, verify } from "./utils/helpers";

import path from "path";

import type { MAGBridge } from "../../typechain-types";

const secondChainId = 0n;
const relayerAddress = "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", secondChainId, "- Chain ID of other chain ");
    console.log("* ", relayerAddress, "- Address of the relayer");
    console.log("\n --- ------- ---- --- ");

    // Deployment.
    const Bridge = await ethers.getContractFactory("MAGBridge", deployer);
    const bridge = <MAGBridge>(<unknown>await upgrades.deployProxy(Bridge, [secondChainId, relayerAddress]));
    await bridge.waitForDeployment();

    const bridgeAddress = bridge.target.toString();

    console.log(`\`MAG Bridge\` is deployed to ${bridgeAddress}`);
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");

    const saveAddress = getAddressSaver(addressesPath, network.name, true);
    saveAddress("MAGBridge", bridgeAddress, false);

    console.log("Deployment is completed.");

    await verify(bridgeAddress, []);
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
