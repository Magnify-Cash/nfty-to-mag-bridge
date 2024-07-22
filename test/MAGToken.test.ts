import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MAGToken } from "../typechain-types";
import { addDec } from "./helpers";

describe.only("MAG Token", function () {
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
            expect(await token.hasRole(await token.PAUSER_ROLE(), deployer.address)).to.be.true;
        });
    });

    describe("Pause control", function () {
        it("Should allow to pause", async () => {
            // Check initial state.
            expect(await token.paused()).to.be.false;

            // Pause.
            await token.pause();

            // Check final state.
            expect(await token.paused()).to.be.true;
        });

        it("Should allow to unpause", async () => {
            // Check initial state.
            expect(await token.paused()).to.be.false;

            // Pause.
            await token.pause();

            // Check state.
            expect(await token.paused()).to.be.true;

            // Unpause.
            await token.unpause();

            // Check final state.
            expect(await token.paused()).to.be.false;
        });

        it("Should revert if caller is not an owner", async () => {
            await expect(token.connect(user).pause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await token.PAUSER_ROLE()).toLocaleLowerCase()
            );

            await token.connect(deployer).pause();

            await expect(token.connect(user).unpause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await token.PAUSER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if state is already set", async () => {
            await token.pause();

            await expect(token.pause()).to.be.revertedWith("Pausable: paused");

            await token.unpause();

            await expect(token.unpause()).to.be.revertedWith("Pausable: not paused");
        });
    });

    describe("Transfer", function () {
        it("Should revert to transfer when paused", async () => {
            await token.pause();

            await expect(token.transfer(user, addDec(1))).to.be.revertedWith(
                "ERC20Pausable: token transfer while paused"
            );

            await token.unpause();

            await token.transfer(user, addDec(1));
        });
    });
});
