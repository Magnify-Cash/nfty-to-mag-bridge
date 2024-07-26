/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
import { ethers, network } from "hardhat";
import { addDec } from "../test/helpers";
import { MockToken } from "../typechain-types";

const to = [
    "0x0309004C4fB9943797f5C530abd8cddE564A9fD4",
    "0xF3Bc8C5F2A857d68D5809f02352C9d73656d74D4",
    "0x0b20EEd40cB02513a4a50Aca5ca37c824d63dc67",
    "0x89758E3b31DdECaBdBFdf6416d153CE611DF903a",
    "0x0309004C4fB9943797f5C530abd8cddE564A9fD4",
    "0x35c7371cdF8b8866b5Fd97e9A324F1821300B140",
    "0xe04Ccb301583eeE3cbCd271ed74E547F8271977b",
    "0xdEdecb49487AbD56aF4a99e2e3D4C63068658e23",
    "0x32e2056d4Fa1470Ae47a94bbc5a8E5eAFdF71E32",
    "0x44A24f43e2a0A668917749f35Fa10Ac29FB9a544",
    "0x0309004C4fB9943797f5C530abd8cddE564A9fD4"
];

const NFTYSepolia = "0x56D2a6fC1aECf6C14B98f53fAa095d962615C2f1";
const MAGSepolia = "0xC38b03122035701B64712FA7cD309ddCA8Ffb535";

const NFTYPolygon = "0xbDA91415bC7e77b461116778F24Ac2D91d25A298";

const NFTYBsc = "0xe3D2c52CA3C9C32Fd0E3c897afaDbB414bc207Df";

const amountToMint = addDec(100_000);

async function main() {
    console.log("Starting minting...");

    if (network.name == "sepolia") {
        const nftyToken = await ethers.getContractAt("MockToken", NFTYSepolia);
        const magToken = await ethers.getContractAt("MockToken", MAGSepolia);

        await mintToken(nftyToken, to, amountToMint);
        await mintToken(magToken, to, amountToMint);
    }

    if (network.name == "polygonAmoy") {
        const nftyToken = await ethers.getContractAt("MockToken", NFTYPolygon);
        await mintToken(nftyToken, to, amountToMint);
    }

    if (network.name == "bscTestnet") {
        const nftyToken = await ethers.getContractAt("MockToken", NFTYBsc);
        await mintToken(nftyToken, to, amountToMint);
    }

    console.log("All tokens minted");
}

async function mintToken(token: MockToken, receivers: string[], amount: bigint) {
    for (const receiver of receivers) {
        const tx = await token.mintFor(receiver, amount);
        await tx.wait(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
