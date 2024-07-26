import { ethers } from "hardhat";

import holdersBsc from "./snapshots/tokenHoldersBsc.json";
import holdersEth from "./snapshots/tokenHoldersEthereum.json";
import holdersPolygon from "./snapshots/tokenHoldersPolygon.json";

let totalHoldings: bigint = 0n;

export function getTotalAmountForBridge() {
    for (const user of holdersEth) {
        totalHoldings += ethers.toBigInt(user.balance);
    }

    // for (const user of holdersBsc) {
    //     totalHoldings += ethers.toBigInt(user.balance);
    // }

    // for (const user of holdersPolygon) {
    //     totalHoldings += ethers.toBigInt(user.balance);
    // }

    const amountForBridge = totalHoldings / 8n;

    console.log("Total amount for bridge: ", amountForBridge);
    console.log("Converted total amount for bridge: ", ethers.formatEther(amountForBridge));

    return { amountForBridge };
}

getTotalAmountForBridge();
