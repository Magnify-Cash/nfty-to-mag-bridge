import { network, ethers } from "hardhat";
import { addDec } from "../test/helpers";

// Sepolia addresses
const NFTYSepolia = "0x56D2a6fC1aECf6C14B98f53fAa095d962615C2f1";
const MAGSepolia = "0xC38b03122035701B64712FA7cD309ddCA8Ffb535";
const NFTYMigrator = "0xb8E75E47fE7c195170747CC2Aa3CB862AF1c72b9";
const MAGBridge = "0x83362A52cF7e3221A73763e508623be7f74f4eA3";

// BSC addresses
const NftyBridgeBsc = "0xA0b09Ed92f434e8C8CF178f3cdA837bBd4b96C55";
const NftyTokenBsc = "0xe3D2c52CA3C9C32Fd0E3c897afaDbB414bc207Df";

// Polygon addresses
const NFTYBridgePolygon = "0x23BA69D704929635225d2d78921E779E54aACF72";
const NFTYTokenPolygon = "0xbDA91415bC7e77b461116778F24Ac2D91d25A298";

const relayers = [
    "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE",
    "0x32E48Ddfb14c151111460B5fc54B70Ce44dE5e32",
    "0x44C02C88EE85fD7C2811e21911133D012B0E4144"
];

async function main() {
    const [deployer] = await ethers.getSigners();

    if (network.name == "sepolia") {
        const nftyToken = await ethers.getContractAt("MockToken", NFTYSepolia);
        const magToken = await ethers.getContractAt("MockToken", MAGSepolia);
        const migrator = await ethers.getContractAt("NFTYMigrator", NFTYMigrator);
        const bridge = await ethers.getContractAt("MAGBridge", MAGBridge);

        // Mint
        console.log("Minting tokens to contracts...");
        await magToken.mintFor(bridge, addDec(1_000_000));
        await magToken.mintFor(migrator, addDec(1_000_000));

        // Grant relayer role
        console.log("Granting relayer role...");

        const role = await bridge.RELAYER_ROLE();
        for (const relayer of relayers) {
            await migrator.connect(deployer).grantRole(role, relayer);
        }

        // Add tokens
        console.log("Setting tokens...");
        await migrator.setMagToken(magToken);
        await migrator.addToken(nftyToken, 0);
        await bridge.addToken(magToken, ethers.ZeroAddress, 0);
    } else if (network.name == "polygonAmoy") {
        const nftyToken = await ethers.getContractAt("MockToken", NFTYTokenPolygon);
        const bridge = await ethers.getContractAt("NFTYBridge", NFTYBridgePolygon);

        // Add tokens
        console.log("Setting tokens...");
        await bridge.addToken(nftyToken, MAGSepolia, 0);

        // Grant relayer role
        console.log("Granting relayer role...");

        const role = await bridge.RELAYER_ROLE();
        await bridge.connect(deployer).grantRole(role, "0xEA6635bdd5e8CE4C83B7Dd4e19AF772b0fCCe4cE");
    } else if (network.name == "bscTestnet") {
        const nftyToken = await ethers.getContractAt("MockToken", NftyTokenBsc);
        const bridge = await ethers.getContractAt("NFTYBridge", NftyBridgeBsc);

        // Add tokens
        console.log("Setting tokens...");
        await bridge.addToken(nftyToken, MAGSepolia, 0);

        // Grant relayer role
        console.log("Granting relayer role...");

        const role = await bridge.RELAYER_ROLE();
        await bridge.connect(deployer).grantRole(role, "0x44C02C88EE85fD7C2811e21911133D012B0E4144");
    }

    console.log("Setup is completed.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
