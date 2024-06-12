// This is a script for deployment and automatically verification of all the contracts (`contracts/`).
import * as dotenv from "dotenv";
dotenv.config();

import { ethers, network } from "hardhat";
import type { Bridge } from "../../typechain-types";
import type {BigNumber} from "ethers/lib/ethers";

const bridgeAddressETH = "0x5890c624d04677379ba9a9b78c7af50e4c7df6e2";
const bridgeAddressBSC = "0x5890c624d04677379ba9a9b78c7af50e4c7df6e2";

async function main() {
    const bridgeETH = await ethers.getContractAt("Bridge", bridgeAddressETH);
    const latestBlockNumberETH = await ethers.provider.getBlockNumber();
    const filterSend = bridgeETH.filters.Send();
    const eventsSend = await bridgeETH.queryFilter(filterSend, latestBlockNumberETH - 3500, "latest");


    const filterBlockRefund = bridgeETH.filters.BlockRefund();
    const eventsBlockRefund = await bridgeETH.queryFilter(filterBlockRefund, latestBlockNumberETH - 3500, "latest");
    const otherProvider = new ethers.providers.JsonRpcProvider(
        (network.name == "loop"? process.env.BSC_TESTNET_URL : process.env.LOOP_URL)
        || "");
    const latestBlockNumberBSC = await otherProvider.getBlockNumber();
    const Bridge = await ethers.getContractFactory("Bridge");
    const bridgeBSC = (new ethers.Contract(bridgeAddressBSC, Bridge.interface, otherProvider)) as Bridge;
    const filterWithdraw = bridgeBSC.filters.Withdraw();
    const eventsWithdraw = await bridgeBSC.queryFilter(filterWithdraw, latestBlockNumberBSC - 3500, "latest");

    const nonceToSend: BigNumber[] = [];
    for(const event of eventsSend) {
        nonceToSend.push(event.args?.nonce);
    }
    const nonceRestrictedToRefund: BigNumber[] = [];
    for(const eventBlockRefund of eventsBlockRefund) {
        nonceRestrictedToRefund.push(eventBlockRefund.args?.nonce);
    }
    const nonceUsedForWithdraw: BigNumber[] = [];
    for(const eventWithdraw of eventsWithdraw) {
        nonceUsedForWithdraw.push(eventWithdraw.args?.nonce);
    }

    const noncesToBlockRefund: BigNumber[] = nonceToSend.filter(
        nonce => !nonceRestrictedToRefund.some(rNonce => rNonce.eq(nonce))
    );
    const noncesToWithdraw: BigNumber[] = nonceToSend.filter(
        nonce => !nonceUsedForWithdraw.some(rNonce => rNonce.eq(nonce))
    );


    for(const nonce of noncesToBlockRefund) {
        console.log("Blocking refund for nonce: ", nonce.toString());
        const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY || "", ethers.provider);
        const tx = await bridgeETH.connect(relayer).blockRefund(nonce);
        await tx.wait();
        console.log("Nonce blocked to refund: ", nonce.toString(), "\n");
    }

    for(const nonce of noncesToWithdraw) {
        const nonceInfo = await bridgeETH.nonceInfo(nonce);
        const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY || "", otherProvider);
        console.log("Withdrawing with nonce: ", nonce.toString());
        const tx = await bridgeBSC.connect(relayer).withdraw(
            await bridgeETH.otherChainToken(nonceInfo.token),
            nonceInfo.to,
            nonceInfo.amount,
            nonce,
        );
        await tx.wait();
        console.log("Withdrawn with nonce: ", nonce.toString(), "\n");
    }
    console.log("Done");
}


// This pattern is recommended to be able to use async/await everywhere and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
