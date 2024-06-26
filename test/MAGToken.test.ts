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
    let deployer: HardhatEthersSigner, user: HardhatEthersSigner, bridge: HardhatEthersSigner;

    let token: MAGToken;

    const TOTAL_SUPPLY = addDec(100_000_000);

    before(async () => {
        // Getting of signers.
        [deployer, user, bridge] = await ethers.getSigners();

        // Token deployment.
        token = await ethers.deployContract("MAGToken", [TOTAL_SUPPLY, bridge], deployer);
        await token.waitForDeployment();

        // Transfer tokens to users.
        await token.transfer(user, addDec(1000));
        await token.transfer(bridge, addDec(1000));

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
            expect(await token.balanceOf(deployer)).to.be.equal(TOTAL_SUPPLY - addDec(1000) * 2n);

            // Check roles.
            expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
            expect(await token.hasRole(await token.PAUSER_ROLE(), deployer.address)).to.be.true;
            expect(await token.hasRole(await token.BRIDGE_ROLE(), bridge.address)).to.be.true;
        });

        it("Should revert if bridge address is zero address during deployment", async () => {
            await expect(
                ethers.deployContract("MAGToken", [TOTAL_SUPPLY, ethers.ZeroAddress], deployer)
            ).to.be.revertedWithCustomError(token, "ZeroAddress");
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

        it("Should allow to transfer tokens only for admin or bridge when paused", async () => {
            // Prepare data.
            const amount = addDec(100);

            // Pause.
            await token.pause();

            // Check that contract is on paused state.
            expect(await token.paused()).to.be.true;

            // Try to transfer tokens from `user` and expect to get error.
            await expect(token.connect(user).transfer(bridge, amount)).to.be.revertedWithCustomError(
                token,
                "OnlyBridgeCanTransfer"
            );

            // Try to transfer tokens from `bridge` and get success.
            const userBalance = await token.balanceOf(user);
            await expect(token.connect(bridge).transfer(user, amount)).to.not.be.reverted;
            expect(await token.balanceOf(user)).to.be.equal(userBalance + amount);

            // Try to transfer tokens from `admin` and get success.
            const userBalance2 = await token.balanceOf(user);
            await expect(token.connect(deployer).transfer(user, amount)).to.not.be.reverted;
            expect(await token.balanceOf(user)).to.be.equal(userBalance2 + amount);
        });

        it("Should allow to transfer tokens for all when not paused", async () => {
            // Prepare data.
            const amount = addDec(100);

            // Check that contract is on not paused state.
            expect(await token.paused()).to.be.false;

            // Try to transfer tokens from `user` and get success.
            const bridgeBalance = await token.balanceOf(bridge);
            await expect(token.connect(user).transfer(bridge, amount)).to.not.be.reverted;
            expect(await token.balanceOf(bridge)).to.be.equal(bridgeBalance + amount);
        });

        it("Should revert if caller does not have pauser role", async () => {
            // Check that `user` is not pauser.
            expect(await token.hasRole(await token.PAUSER_ROLE(), user.address)).to.be.false;

            // Try to pause and expect to get error.
            await expect(token.connect(user).pause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await token.PAUSER_ROLE()).toLocaleLowerCase()
            );

            // Set state to paused.
            await token.pause();

            // Check that contract is on paused state.
            expect(await token.paused()).to.be.true;

            // Try to unpause from `user` and expect to get error.
            await expect(token.connect(user).unpause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await token.PAUSER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert when target state already set", async () => {
            // Check that contract is on not paused state.
            expect(await token.paused()).to.be.false;

            // Set state to unpaused.
            await expect(token.unpause()).to.be.revertedWith("Pausable: not paused");

            // Set state to paused.
            await token.pause();

            // Check that contract is on paused state.
            expect(await token.paused()).to.be.true;

            // Set state to paused.
            await expect(token.pause()).to.be.revertedWith("Pausable: paused");
        });
    });
});
