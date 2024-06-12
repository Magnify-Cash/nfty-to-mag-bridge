/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
import path from "path";
const { ethers } = hre;
import { getAddressSaver, verify } from "./deployment/utils/helpers";

const tokenAddress = "0x5bcbe81bD3e850f23febDb59C8bf86A6Dd93e782";
const to = [
    // "0xA7c3A6197320C20a77D5f16C50450E07974Af7B9",
    // "0x1CA29ceD2247B3b4Cd97689675b794591763CfC5",
    // "0x12d3cF31164310eb4B3cEf6C1AC1Dc56711d77DF",
    // "0x717292868976Eb1Bb8c1DB84e4bCF569515bc43B",
    // "0xe2a51B6779a3e071568E6238934EbE25C3614Cc9"
    "0xF64ED8E0536C0f1A8EE44D090560e902CF6c043b"
]
async function main() {
    const [deployer] = await ethers.getSigners();

    const token = (await ethers.getContractAt("MockToken", tokenAddress));
    for(let i = 0; i < to.length; i++) {
        const tx = await token.connect(deployer).mintFor(to[i], ethers.utils.parseUnits("100", await token.decimals()));
        await tx.wait();
        console.log("Minted 100", await token.symbol(), "to", to[i]);
    }
}

main().catch((error) => {
 console.error(error);
 process.exitCode = 1;
});
