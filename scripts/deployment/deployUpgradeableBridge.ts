// This is a script for deployment and automatically verification of all the contracts (`contracts/`).

import { ethers, upgrades, network } from "hardhat";
import type { Bridge } from "../../typechain-types";
import { getAddressSaver, verify } from "./utils/helpers";
import path from "path";
import { addDec } from "../../test/helpers";

const chainIdOnOtherChain = 97;
const nativeAddress = "0x0000000000000000000000000000000000000000";
const minAmountOfNative = addDec(10);
const wrappedNativeOnTheOtherChain = "0xDD5BaC9985409021c8C53E43f091910c478ADf4b";
const relayerAddress = "0x4A787B2f586f61e894b40e8827cd983747faE915";
const FIVE_MINUTES = 300;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", chainIdOnOtherChain, "- Chain ID of other chain ");
    console.log("* ", nativeAddress, "- Address of native token");
    console.log("* ", minAmountOfNative, "- Minimum amount for the wrapped native token");
    console.log(
        "* ",
        wrappedNativeOnTheOtherChain,
        "- Address on the other chain of the token for the wrapped native token"
    );
    console.log("* ", relayerAddress, "- Address of the relayer");
    console.log("* ", FIVE_MINUTES, "- Minimum time to wait before refunding a transaction");
    console.log("\n --- ------- ---- --- ");

    // Deployment.
    const Bridge = await ethers.getContractFactory("Bridge", deployer);
    const bridge = <Bridge>(
        (<unknown>(
            await upgrades.deployProxy(Bridge, [
                chainIdOnOtherChain,
                nativeAddress,
                minAmountOfNative,
                wrappedNativeOnTheOtherChain,
                relayerAddress,
                FIVE_MINUTES
            ])
        ))
    );
    await bridge.waitForDeployment();

    console.log(`\`bridge\` is deployed to ${bridge.target}.`);
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");

    const bridgeAddress = bridge.target.toString();
    const saveAddress = getAddressSaver(addressesPath, network.name, true);
    saveAddress("Bridge", bridgeAddress, false);

    console.log("Deployment is completed.");

    await verify(bridgeAddress, []);

    return bridge;
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
