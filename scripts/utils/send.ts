// This is a script for deployment and automatically verification of all the contracts (`contracts/`).

import { ethers } from "hardhat";


const bridgeAddress = "0x5890c624d04677379ba9a9b78c7af50e4c7df6e2";
const tokenAddress = "0xA506Da5F0a1Da881ace15f1BEC28C069f56249D5";
const amount = 1;

async function main() {
    const [deployer] = await ethers.getSigners();

    const token = await ethers.getContractAt("MockToken", tokenAddress, deployer);
    const bridge = await ethers.getContractAt("Bridge", bridgeAddress, deployer);
    const amountWithDec = ethers.utils.parseUnits(amount.toString(), await token.decimals());

    if((await token.connect(deployer).balanceOf(deployer.address)).lt(amountWithDec))
        await token.connect(deployer).mint(amountWithDec);
    if((await token.connect(deployer).allowance(deployer.address, bridge.address))
    .lt(amountWithDec)){
        const tx = await token.connect(deployer).approve(
            bridge.address,
            amountWithDec
        );
        await tx.wait();
    }

    const tx = await bridge.connect(deployer).send(
        token.address,
        deployer.address,
        ethers.utils.parseUnits(amount.toString(), await token.decimals())
    );
    const receipt = await tx.wait();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const nonce = receipt.events?.find((event) => event.event === "Send")?.args?.nonce;
    console.log("Sent coins to the bridge.")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    console.log("Nonce:", nonce.toString());
}

// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
