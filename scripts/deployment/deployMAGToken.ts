import hre from "hardhat";
import path from "path";

import { getAddressSaver, verify } from "./utils/helpers";
import { getTotalSupply } from "../utils/getTotalSupply";
import { addDec } from "../../test/helpers";

const { ethers } = hre;

// Total supply of tokens to be minted during deployment
// For default value is 100_000_000 + 18 decimals
const TOTAL_SUPPLY = addDec(100_000_000);
const { amountForBridge, totalSupply } = getTotalSupply();

console.log("Predicted amount for bridge", amountForBridge);

// Address of the bridge contract on BASE network
const testnetBridge = "0xaB2C4DAb32a8a07dD0403E23ab67b4E787270ace";
const mainnetBridge = "";

async function main() {
    const [deployer] = await ethers.getSigners();

    const bridgeAddress = await getBridgeAddress();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", totalSupply, "- Total supply of tokens");
    console.log("* ", bridgeAddress, "- Address of the bridge contract");
    console.log("* ", amountForBridge, "- Total amount for the bridge contract");

    console.log("\n --- ------- ---- --- ");

    const addressesPath = path.join(__dirname, "./deploymentAddresses.json");
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const saveAddress = getAddressSaver(addressesPath, network, true);

    const MAGToken = await ethers.deployContract("MAGToken", [TOTAL_SUPPLY, bridgeAddress], deployer);
    await MAGToken.waitForDeployment();

    const tokenAddress = MAGToken.target.toString();

    saveAddress(await MAGToken.symbol(), tokenAddress, false);
    console.log("Deployment is completed.");
    await verify(tokenAddress, [TOTAL_SUPPLY, bridgeAddress]);
}

async function getBridgeAddress() {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    if (chainId == 84532n) return testnetBridge;

    return mainnetBridge;
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
