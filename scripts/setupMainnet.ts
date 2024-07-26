import { network, ethers } from "hardhat";
import { addDec } from "../test/helpers";

// Relayers
const polygonRelayer = "";
const bscRelayer = "";
const relayers = [polygonRelayer, bscRelayer];

// Token addresses
const NFTY_ETH = "";
const NFTY_POL = "";
const NFTY_BSC = "";
const MAG_ETH = "";

// Bridge addresses
const NFTY_BRIDGE_POL = "";
const NFTY_BRIDGE_BSC = "";
const NFTY_MIGRATOR = "";
const MAG_BRIDGE = "";

const MIN_AMOUNT = 8n;

async function main() {
    // Get caller of setup transactions
    const [caller] = await ethers.getSigners();

    console.log(`Starting setup contracts on ${network.name}`);

    if (network.name == "mainnet") {
        console.log(`Getting contracts from addresses...`);

        // Get contracts instance from address
        const magBridge = await ethers.getContractAt("MAGBridge", MAG_BRIDGE, caller);
        const nftyMigrator = await ethers.getContractAt("NFTYMigrator", NFTY_MIGRATOR, caller);

        console.log(`Setting relayers...`);

        // Set relayers
        const role = await magBridge.RELAYER_ROLE();
        for (const relayer of relayers) {
            await nftyMigrator.connect(caller).grantRole(role, relayer);
        }

        console.log(`Setting tokens...`);

        // Set tokens
        await nftyMigrator.setMagToken(MAG_ETH);
        await nftyMigrator.addToken(NFTY_ETH, MIN_AMOUNT);
        await magBridge.addToken(MAG_ETH, ethers.ZeroAddress, MIN_AMOUNT);

        //
    } else if (network.name == "polygon") {
        console.log(`Getting contracts from addresses...`);

        // Get contracts instance from address
        const nftyBridge = await ethers.getContractAt("NFTYBridge", NFTY_BRIDGE_POL, caller);

        console.log(`Setting relayer...`);

        // Set relayers
        const role = await nftyBridge.RELAYER_ROLE();
        await nftyBridge.connect(caller).grantRole(role, polygonRelayer);

        console.log(`Setting token...`);

        // Set tokens
        await nftyBridge.addToken(NFTY_POL, MAG_ETH, MIN_AMOUNT);

        //
    } else if (network.name == "bsc") {
        console.log(`Getting contracts from addresses...`);

        // Get contracts instance from address
        const nftyBridge = await ethers.getContractAt("NFTYBridge", NFTY_BRIDGE_BSC, caller);

        console.log(`Setting relayer...`);

        // Set relayers
        const role = await nftyBridge.RELAYER_ROLE();
        await nftyBridge.connect(caller).grantRole(role, bscRelayer);

        console.log(`Setting token...`);

        // Set tokens
        await nftyBridge.addToken(NFTY_BSC, MAG_ETH, MIN_AMOUNT);

        //
    } else {
        throw new Error("Wrong network name");
    }

    console.log(`Setup is completed!`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
