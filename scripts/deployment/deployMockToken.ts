import hre from "hardhat";
import path from "path";

import { getAddressSaver, verify } from "./utils/helpers";

const { ethers } = hre;

// async function getTokenInfo() {
//     const chainId = (await ethers.provider.getNetwork()).chainId;

//     if (chainId == 84532n) {
//         return ["MAG", "MAG", 18n] as const;
//     } else {
//         return ["NFTY", "NFTY", 18n] as const;
//     }
// }

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const name = "NFTY",
        symbol = "NFTY",
        decimals = 18n;
    // const [name, symbol, decimals] = await getTokenInfo();
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");
    const saveAddress = getAddressSaver(addressesPath, network, true);

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", symbol, "- Token symbol");
    console.log("* ", decimals, "- Token decimals");
    console.log("\n --- ------- ---- --- ");

    const token = await ethers.deployContract("MockToken", [name, symbol, decimals], deployer);
    await token.waitForDeployment();

    const tokenAddress = token.target.toString();

    saveAddress(await token.symbol(), tokenAddress, false);
    console.log("Deployment is completed.");
    await verify(tokenAddress, [name, symbol, decimals]);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
