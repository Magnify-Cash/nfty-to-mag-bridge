import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import path from "path";

import Moralis from "moralis";

const apiKey = process.env.MORALIS_API_KEY;

// Address of the token on Ethereum
const NFTY_ETH_ADDRESS = "0xe1d7c7a4596b038ced2a84bf65b8647271c53208";

async function main() {
    const filePath = path.join(__dirname, "./tokenHoldersEthereum.json");

    await Moralis.start({
        apiKey: apiKey
    });

    const finaldata = [];

    let cursor;

    /*
    Amount of pages for getting holders data
    Every page can get up to 100 holders
    */
    const pages = 28;

    for (let i = 0; i < pages; i++) {
        if (i == 0) {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x1",
                limit: 100,
                order: "DESC",
                tokenAddress: NFTY_ETH_ADDRESS
            });
            cursor = response.response.cursor;

            finaldata.push(...response.response.result);
        } else {
            const response = await Moralis.EvmApi.token.getTokenOwners({
                chain: "0x1",
                limit: 100,
                order: "DESC",
                cursor: cursor,
                tokenAddress: NFTY_ETH_ADDRESS
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
