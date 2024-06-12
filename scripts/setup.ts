/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from "hardhat";
import path from "path";
const { ethers } = hre;
import { getAddressSaver, verify } from "./deployment/utils/helpers";

const bridgeAddress = "0xF64ED8E0536C0f1A8EE44D090560e902CF6c043b";
const tokens = [
    "0x68364564BcEb4a226f9c9Cf24d00bd1e4f5C5b60",
    "0x30FbB21198F08230dC1c2F414F9a18a8482F1da3",
    "0x5bcbe81bD3e850f23febDb59C8bf86A6Dd93e782",
];
const tokensOnSecondChain = [
    "0x33cA0D2ac807BD6C7D8A79a8EF7d14B6f7d16DD0",
    "0x145a5e49aDB20394f91622d7cc0CA2Cc05B03A07",
    "0x8f8B7C2C3E3D267D7210f85c6E4d9512f1d6Aac6"
];
const mintAmounts = [
    0.01,
    1,
    1
]
async function main() {
    const [deployer] = await ethers.getSigners();
    const bridge = await ethers.getContractAt("Bridge", bridgeAddress);
    if(tokens.length !== tokensOnSecondChain.length || tokens.length !== mintAmounts.length) {
        throw new Error("Invalid input");
    }
    for(let i = 0; i < tokens.length; i++) {
        const token = (await ethers.getContractAt("MockToken", tokens[i]));
        if(!(await bridge.tokenIsSupported(token.address))) {
            const tx = await bridge.connect(deployer).addToken(token.address,
                tokensOnSecondChain[i],
                ethers.utils.parseUnits(mintAmounts[i].toString(), await token.decimals())
            );
            await tx.wait();
            console.log(`Token ${token.address} added to the bridge`);
        }
        else {
            console.log(`Token ${token.address} already added to the bridge`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
