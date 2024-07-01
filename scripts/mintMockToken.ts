/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
const { ethers } = hre;
import { addDec } from "../test/helpers";

const to = ["0x89758E3b31DdECaBdBFdf6416d153CE611DF903a", "0x0309004C4fB9943797f5C530abd8cddE564A9fD4"];

const mockTokenBase = "0xaC9809c3cdBa4052F39501DEC700fc23776e40AF";
const mockTokenSepolia = "0x6c28de594318C8AB116Ad5865A7fc4b75a8e1dfe";
const mockTokenPolygon = "0x0B5d53E3b79e3317A17AD5F61910d4F807eCa56a";
const mockTokenBSC = "0x5Ce62153Cd1F7Da9099d81b58906C0843886dd5D";

const amountToMint = addDec(1000);

async function main() {
    const networkName = await getNetworkName();
    const tokenAddress = (await getTokenAddress(networkName)) || "";

    const token = await ethers.getContractAt("MockToken", tokenAddress);

    for (const address of to) {
        console.log("Minting tokens for", address);

        const tx = await token.mintFor(address, amountToMint);
        await tx.wait();

        console.log("Tokens minted for", address);
    }

    console.log("All tokens minted");
}

async function getNetworkName() {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    if (chainId == 11155111n) return "ETH";
    if (chainId == 97n) return "BSC";
    if (chainId == 80002n) return "POLYGON";

    return "BASE";
}

async function getTokenAddress(networkName: string) {
    if (networkName == "ETH") return mockTokenSepolia;
    if (networkName == "BSC") return mockTokenBSC;
    if (networkName == "POLYGON") return mockTokenPolygon;
    if (networkName == "BASE") return mockTokenBase;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
