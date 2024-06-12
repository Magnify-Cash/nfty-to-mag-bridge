// This is a script for deployment and automatically verification of all the contracts (`contracts/`).

import { ethers, upgrades, network } from "hardhat";
import type { Bridge } from "../../typechain-types";
import { getAddressSaver, verify } from "./utils/helpers";
import path from "path";


const bsc_bridgeAddress = "0x0ec717d1fc58bbF6a2481852099547494BF341F4";
const sepolia_bridgeAddress = "0x7F599AA24496154506e8575b36cFb472CE842a18";

async function main() {
    const [deployer] = await ethers.getSigners();
    const networkName = network.name;
    if (networkName === "bsc_testnet") {
        await upgrades.upgradeProxy(bsc_bridgeAddress, await ethers.getContractFactory("Bridge", deployer));
        console.log("Bridge upgraded");
    }
    else if (networkName === "sepolia") {
        await upgrades.upgradeProxy(sepolia_bridgeAddress, await ethers.getContractFactory("Bridge", deployer));
        console.log("Bridge upgraded");
    }
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
