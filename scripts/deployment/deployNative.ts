import hre from "hardhat";
import path from "path";
const { ethers } = hre;
import { getAddressSaver, verify } from "./utils/helpers";
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = (await ethers.getDefaultProvider().getNetwork()).name; // Getting of the current network
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");
    const saveAddress = getAddressSaver(addressesPath, network, true);

    const Native = await ethers.getContractFactory("WrappedNative", deployer);
    const native = await Native.deploy("Wrapped LOOP", "WLOOP");
    await native.deployed();
    saveAddress(await native.symbol(), native.address, false);
    await verify(native.address, ["Wrapped LOOP", "WLOOP"]);
    console.log("Deployment is completed.")
}

main().catch((error) => {
 console.error(error);
 process.exitCode = 1;
});
