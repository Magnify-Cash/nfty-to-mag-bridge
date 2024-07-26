import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MockToken, NFTYMigrator } from "../typechain-types";
import { addDec } from "./helpers";

describe("NFTY Migrator", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: HardhatEthersSigner, user: HardhatEthersSigner;

    let migrator: NFTYMigrator;
    let nfty: MockToken;
    let mag: MockToken;

    before(async () => {
        // Getting of signers.
        [deployer, user] = await ethers.getSigners();

        // Deployment of the mocks.
        nfty = await ethers.deployContract("MockToken", ["NFTY", "NFTY", 18], deployer);
        mag = await ethers.deployContract("MockToken", ["MAG", "MAG", 18]);

        // Deployment of the factory.
        const Migrator = await ethers.getContractFactory("NFTYMigrator", deployer);
        migrator = <NFTYMigrator>(<unknown>await upgrades.deployProxy(Migrator, []));
        await migrator.waitForDeployment();

        // Update contracts settings.
        await migrator.setMagToken(mag);
        await migrator.addToken(nfty, 8);

        await nfty.mintFor(user, addDec(10_000));
        await mag.mintFor(migrator, addDec(100_000));

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("# Initializer", function () {
        it("Should revert if call initializer twice", async () => {
            await expect(migrator.initialize()).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should initialize correctly", async () => {
            const DEFAULT_ADMIN_ROLE = await migrator.DEFAULT_ADMIN_ROLE();
            expect(await migrator.hasRole(DEFAULT_ADMIN_ROLE, deployer)).to.be.true;
        });
    });

    describe("# Send", function () {
        it("Should allow to migrate nftys", async () => {
            // Prepare data.
            const token = nfty;
            const to = user.address;
            const amount = addDec(1000);

            const expectedAmountToReceive = await migrator.getConvertedAmount(amount);

            const nftyBalance = await nfty.balanceOf(user);
            const magBalance = await mag.balanceOf(mag);
            const migratorBalanceNfty = await nfty.balanceOf(migrator);
            const migratorBalanceMag = await mag.balanceOf(migrator);

            // Send nftys.
            await nfty.connect(user).approve(migrator, amount);
            await expect(migrator.connect(user).send(token, to, amount))
                .to.emit(migrator, "Send")
                .withArgs(nfty, to, amount, expectedAmountToReceive);

            // Check balances.
            expect(await nfty.balanceOf(user)).to.be.equal(nftyBalance - amount);
            expect(await nfty.balanceOf(migrator)).to.be.equal(migratorBalanceNfty + amount);
            expect(await mag.balanceOf(user)).to.be.equal(magBalance + expectedAmountToReceive);
            expect(await mag.balanceOf(migrator)).to.be.equal(migratorBalanceMag - expectedAmountToReceive);
        });

        it("Should revert if nfty is not supported", async () => {
            const unsupportedToken = await ethers.deployContract("MockToken", ["TKN", "TKN", 18]);

            await expect(migrator.connect(user).send(unsupportedToken, user.address, addDec(1)))
                .to.be.revertedWithCustomError(migrator, "TokenIsNotSupported")
                .withArgs(unsupportedToken);
        });

        it("Should revert if amount to send is too small", async () => {
            await nfty.connect(user).approve(migrator, 7);

            await expect(migrator.connect(user).send(nfty, user.address, 7))
                .to.be.revertedWithCustomError(migrator, "AmountIsLessThanMinimum")
                .withArgs(7n, 8n);
        });

        it("Should revert if receiver address is zero address", async () => {
            const receiver = ethers.ZeroAddress;

            await expect(migrator.connect(user).send(nfty, receiver, addDec(1))).to.be.revertedWithCustomError(
                migrator,
                "ZeroAddress"
            );
        });

        it("Should revert if contract is paused", async () => {
            await migrator.pause();
            await expect(migrator.connect(user).send(nfty, user.address, addDec(1))).to.be.revertedWith(
                "Pausable: paused"
            );
        });
    });

    describe("# Emergency withdraw", function () {
        it("Should withdraw nftys in case of emergency", async () => {
            await nfty.mintFor(migrator, addDec(10));

            const balanceBefore = await nfty.balanceOf(user);
            const migratorBalanceBefore = await nfty.balanceOf(migrator);

            await migrator.pause();
            await migrator.connect(deployer).emergencyWithdraw(nfty, user, addDec(1));

            const balanceAfter = await nfty.balanceOf(user);
            const migratorBalanceAfter = await nfty.balanceOf(migrator);

            expect(balanceAfter).to.be.equal(balanceBefore + addDec(1));
            expect(migratorBalanceAfter).to.be.equal(migratorBalanceBefore - addDec(1));
        });

        it("Should withdraw native in case of emergency", async () => {
            // Send 10 ether to the migrator
            await user.sendTransaction({
                to: migrator,
                value: addDec(10)
            });

            const balanceBefore = await ethers.provider.getBalance(user);

            await migrator.pause();
            await migrator.connect(deployer).emergencyWithdraw(ethers.ZeroAddress, user, addDec(1));

            const balanceAfter = await ethers.provider.getBalance(user);
            const migratorBalanceAfter = await ethers.provider.getBalance(migrator);

            expect(balanceAfter).to.be.equal(balanceBefore + addDec(10));
            expect(migratorBalanceAfter).to.be.equal(0);
        });

        it("Should revert if caller is not an owner", async () => {
            await migrator.pause();

            await expect(migrator.connect(user).emergencyWithdraw(nfty, user, addDec(1))).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is not paused", async () => {
            await expect(migrator.connect(deployer).emergencyWithdraw(nfty, user, addDec(1))).to.be.revertedWith(
                "Pausable: not paused"
            );
        });

        it("Should revert if receiver is zero address", async () => {
            await migrator.pause();

            const receiver = ethers.ZeroAddress;

            await expect(
                migrator.connect(deployer).emergencyWithdraw(nfty, receiver, addDec(1))
            ).to.be.revertedWithCustomError(migrator, "ZeroAddress");
        });
    });

    describe("# Utils", function () {
        it("Should unpause", async () => {
            await migrator.pause();
            expect(await migrator.paused()).to.be.true;
            await migrator.unpause();
            expect(await migrator.paused()).to.be.false;
        });

        it("Should revert if caller is not an owner", async () => {
            await expect(migrator.connect(user).pause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(migrator.connect(user).unpause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(migrator.connect(user).addToken(nfty, ethers.parseEther("0.1"))).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(migrator.connect(user).upgradeTo(nfty)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(
                migrator.connect(user).setMinAmountForToken(nfty, ethers.parseEther("0.1"))
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should add token", async () => {
            const token = await ethers.getContractFactory("MockToken", deployer);
            const newtoken = await token.deploy("token", "ERC20", 18);
            const tx = await migrator.addToken(newtoken, ethers.parseEther("0.1"));
            expect(tx).to.emit(migrator, "AddToken").withArgs(newtoken, user.address, ethers.parseEther("0.1"));
            expect(await migrator.tokenIsSupported(newtoken)).to.be.true;
            expect(await migrator.minAmountForToken(newtoken)).to.be.equal(ethers.parseEther("0.1"));
        });

        it("Should be able to upgrade contract from owner", async () => {
            const Bridge = await ethers.getContractFactory("NFTYMigrator", deployer);
            const newBridgeImplementation = await Bridge.deploy();
            await expect(migrator.upgradeTo(newBridgeImplementation)).to.not.be.reverted;
        });

        it("Should set new min amount for token", async () => {
            await migrator.setMinAmountForToken(nfty, ethers.parseEther("0.2"));
            expect(await migrator.minAmountForToken(nfty)).to.be.equal(ethers.parseEther("0.2"));
        });
    });

    describe("# Removed token", function () {
        it("Should remove token", async () => {
            const newToken = await ethers.deployContract("MockToken", ["token", "ERC20", 18], deployer);
            await migrator.addToken(newToken, ethers.parseEther("0.1"));
            expect(await migrator.tokenIsSupported(newToken)).to.be.true;

            await migrator.removeToken(newToken);
            expect(await migrator.tokenIsSupported(newToken)).to.be.false;

            await migrator.addToken(nfty, ethers.parseEther("0.1"));
            const whitelistSize = await migrator.allWhitelistedTokensLength();
            await migrator.removeToken(nfty);
            expect(await migrator.tokenIsSupported(nfty)).to.be.false;
            expect(await migrator.allWhitelistedTokensLength()).to.be.equal(whitelistSize - 1n);
            const whitelist = await migrator.getAllWhitelistedTokens();
            expect(whitelist).to.not.include(nfty);
        });

        it("Should not send removed token", async () => {
            await migrator.addToken(nfty, ethers.parseEther("0.1"));
            await migrator.removeToken(nfty);
            await expect(migrator.send(nfty, user.address, ethers.parseEther("0.1")))
                .to.be.revertedWithCustomError(migrator, "TokenIsNotSupported")
                .withArgs(nfty);
        });

        it("Should revert removing not supported token", async () => {
            const unsupportedToken = await ethers.deployContract("MockToken", ["TKN", "TKN", 18]);
            await expect(migrator.removeToken(unsupportedToken))
                .to.be.revertedWithCustomError(migrator, "TokenIsNotSupported")
                .withArgs(unsupportedToken);
        });

        it("Should revert removing token by non admin caller", async () => {
            await expect(migrator.connect(user).removeToken(nfty)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });
    });

    describe("# MAG token setter", function () {
        it("Should set MAG token", async () => {
            const newToken = await ethers.deployContract("MockToken", ["token", "ERC20", 18], deployer);
            await migrator.setMagToken(newToken);
            expect(await migrator.mag()).to.be.equal(newToken);
        });

        it("Should revert setting MAG token by non admin caller", async () => {
            const newToken = await ethers.deployContract("MockToken", ["token", "ERC20", 18], deployer);
            await expect(migrator.connect(user).setMagToken(newToken)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await migrator.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert setting MAG token to zero address", async () => {
            await expect(migrator.setMagToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                migrator,
                "ZeroAddress"
            );
        });
    });
});
