import hre from "hardhat";
import path from "path";

import { getAddressSaver, verify } from "./utils/helpers";
import { addDec } from "../../test/helpers";

const { ethers } = hre;

// Total supply of tokens to be minted during deployment
// For default value is 100_000_000 + 18 decimals
const TOTAL_SUPPLY = addDec(100_000_000);

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", TOTAL_SUPPLY, "- Total supply of the tokens");

    console.log("\n --- ------- ---- --- ");

    const addressesPath = path.join(__dirname, "./deploymentAddresses.json");
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const saveAddress = getAddressSaver(addressesPath, network, true);

    const MAGToken = await ethers.deployContract("MAGToken", [TOTAL_SUPPLY], deployer);
    await MAGToken.waitForDeployment();

    const tokenAddress = MAGToken.target.toString();

    saveAddress(await MAGToken.symbol(), tokenAddress, false);
    console.log("Deployment is completed.");
    await verify(tokenAddress, [TOTAL_SUPPLY]);
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
