/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
import path from "path";
const { ethers } = hre;
import { getAddressSaver, verify } from "./utils/helpers";

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");


    const Multicall3 = (await ethers.getContractFactory("Multicall3"));
    const multicall = await Multicall3.connect(deployer).deploy();
    await multicall.deployed();

    console.log("Deployment is completed.")
    await verify(multicall.address, []);
}

main().catch((error) => {
 console.error(error);
 process.exitCode = 1;
});
