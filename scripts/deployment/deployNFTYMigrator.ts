// This is a script for deployment and automatically verification of all the contracts (`contracts/`).
import { ethers, upgrades, network } from "hardhat";
import { getAddressSaver, verify } from "./utils/helpers";
import path from "path";
import { NFTYMigrator } from "../../typechain-types";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(`Starting setup for NFTY migrator on ${network.name}`);

    // Deployment.
    const Migrator = await ethers.getContractFactory("NFTYMigrator", deployer);
    const migrator = <NFTYMigrator>(<unknown>await upgrades.deployProxy(Migrator, []));
    await migrator.waitForDeployment();

    const migratorAddress = migrator.target.toString();

    console.log(`\`NFTY Migrator\` is deployed to ${migratorAddress}`);
    const addressesPath = path.join(__dirname, "../deployment/deploymentAddresses.json");

    const saveAddress = getAddressSaver(addressesPath, network.name, true);
    saveAddress("NFTYMigrator", migratorAddress, false);

    console.log("Deployment is completed.");

    await verify(migratorAddress, []);

    return migratorAddress;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
