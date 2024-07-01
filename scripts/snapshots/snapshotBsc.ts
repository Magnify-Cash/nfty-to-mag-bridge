import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import path from "path";

import Moralis from "moralis";

const apiKey = process.env.MORALIS_API_KEY;

// Address of the token on BSC
const NFTY_BSC_ADDRESS = "0x5774b2fc3e91af89f89141eacf76545e74265982";

async function main() {
    const filePath = path.join(__dirname, "./tokenHoldersBsc.json");

    await Moralis.start({
        apiKey: apiKey
    });

    const finaldata = [];

    let cursor;

    /*
    Amount of pages for getting holders data
    Every page can get up to 100 holders
    */
    const pages = 126;

    for (let i = 0; i < pages; i++) {
        if (i == 0) {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x38",
                limit: 100,
                order: "DESC",
                tokenAddress: NFTY_BSC_ADDRESS
            });
            cursor = response.response.cursor;

            finaldata.push(...response.response.result);
        } else {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x38",
                limit: 100,
                order: "DESC",
                cursor: cursor,
                tokenAddress: NFTY_BSC_ADDRESS
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
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
