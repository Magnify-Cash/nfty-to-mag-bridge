import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MAGToken } from "../typechain-types";
import { addDec } from "./helpers";

describe("MAG Token", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: HardhatEthersSigner, user: HardhatEthersSigner;

    let token: MAGToken;

    const TOTAL_SUPPLY = addDec(100_000_000);

    before(async () => {
        // Getting of signers.
        [deployer, user] = await ethers.getSigners();

        // Token deployment.
        token = await ethers.deployContract("MAGToken", [TOTAL_SUPPLY], deployer);
        await token.waitForDeployment();

        // Transfer tokens to users.
        await token.transfer(user, addDec(1000));

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("Constructor", function () {
        it("Should set all values correctly", async () => {
            expect(await token.name()).to.be.equal("MAG Token");
            expect(await token.symbol()).to.be.equal("MAG");
            expect(await token.decimals()).to.be.equal(18);
            expect(await token.totalSupply()).to.be.equal(TOTAL_SUPPLY);

            // Check balance.
            expect(await token.balanceOf(deployer)).to.be.equal(TOTAL_SUPPLY - addDec(1000));

            // Check roles.
            expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
        });
    });
});
