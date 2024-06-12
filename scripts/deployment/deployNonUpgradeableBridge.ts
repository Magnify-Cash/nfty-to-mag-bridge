// This is a script for deployment and automatically verification of all the contracts (`contracts/`).

import { ethers, upgrades, network } from "hardhat";
import type { Bridge } from "../../typechain-types";
import { getAddressSaver, verify } from "./utils/helpers";
import path from "path";


const chainIdOnOtherChain = 12345;
const nativeAddress = "0x0000000000000000000000000000000000000000";
const minAmountOfNative = ethers.utils.parseEther("0.001");
const wrappedNativeOnTheOtherChain = "0x8f8B7C2C3E3D267D7210f85c6E4d9512f1d6Aac6";
const relayerAddress = "0xA7c3A6197320C20a77D5f16C50450E07974Af7B9";
const FIVE_MINUTES = 300;


async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", chainIdOnOtherChain, "- Chain ID of other chain ");
    console.log("* ", nativeAddress, "- Address of native token");
    console.log("* ", minAmountOfNative, "- Minimum amount for the wrapped native token");
    console.log("* ", wrappedNativeOnTheOtherChain,
    "- Address on the other chain of the token for the wrapped native token");
    console.log("* ", relayerAddress, "- Address of the relayer");
    console.log("* ", FIVE_MINUTES, "- Minimum time to wait before refunding a transaction");
    console.log("\n --- ------- ---- --- ");

    // Deployment.
    const Bridge = await ethers.getContractFactory("Bridge", deployer);
    const bridge = await Bridge.deploy();
    await bridge.deployed();
    await bridge.initialize(
        chainIdOnOtherChain,
        nativeAddress,
        minAmountOfNative,
        wrappedNativeOnTheOtherChain,
        relayerAddress,
        FIVE_MINUTES
    );

    console.log(`\`bridge\` is deployed to ${bridge.address}.`);
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");
    const saveAddress = getAddressSaver(addressesPath, network.name, true);
    saveAddress("Bridge", bridge.address, false);

    console.log("Deployment is completed.")

    await verify(
        bridge.address,
        []
    );

    return bridge;
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
