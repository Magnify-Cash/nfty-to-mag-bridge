import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import path from "path";

import Moralis from "moralis";

const apiKey = process.env.MORALIS_API_KEY;

// Address of the token on Polygon
const NFTY_POLYGON_ADDRESS = "0xCC081220542a60A8Ea7963C4F53D522b503272c1";

async function main() {
    console.log("Starting snapshot...");
    const filePath = path.join(__dirname, "./tokenHoldersPolygon.json");

    await Moralis.start({
        apiKey: apiKey
    });

    const finaldata = [];

    let cursor;

    /*
    Amount of pages for getting holders data
    Every page can get up to 100 holders
    */
    const pages = 3;

    for (let i = 0; i < pages; i++) {
        if (i == 0) {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x89",
                limit: 100,
                order: "DESC",
                tokenAddress: NFTY_POLYGON_ADDRESS
            });
            cursor = response.response.cursor;

            finaldata.push(...response.response.result);
        } else {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x89",
                limit: 100,
                order: "DESC",
                cursor: cursor,
                tokenAddress: NFTY_POLYGON_ADDRESS
            });
            cursor = response.response.cursor;

            finaldata.push(...response.response.result);
        }
    }

    const filterdata: any = [];

    finaldata.forEach((el) => {
        const data = {
            walletAddress: el.ownerAddress,
            balance: el.balance
        };
        filterdata.push(data);
    });

    fs.writeFileSync(filePath, JSON.stringify(filterdata, null, 2));

    console.log("Snapshot complete!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
