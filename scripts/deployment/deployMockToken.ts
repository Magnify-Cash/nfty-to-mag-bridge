/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
import path from "path";
const { ethers } = hre;
import { getAddressSaver, verify } from "./utils/helpers";

const name = "SPHYNX BNB";
const symbol = "SPHYNX";
const decimals = 18;
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");
    const saveAddress = getAddressSaver(addressesPath, network, true);

    console.log("\n --- Deployed data --- \n");
    console.log("* ", deployer.address, "- Deployer address");
    console.log("* ", symbol, "- Token symbol");
    console.log("* ", decimals, "- Token decimals");
    console.log("\n --- ------- ---- --- ");

    const MockToken = (await ethers.getContractFactory("MockToken"));
    const token = await MockToken.connect(deployer).deploy(
        name, symbol, decimals
    );
    await token.deployed();

    saveAddress(await token.symbol(), token.address, false);
    console.log("Deployment is completed.")
    await verify(token.address, [name, symbol, decimals]);
}

main().catch((error) => {
 console.error(error);
 process.exitCode = 1;
});
