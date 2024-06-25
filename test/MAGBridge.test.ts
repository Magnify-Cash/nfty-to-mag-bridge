import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MAGBridge, MockToken } from "../typechain-types";
import { addDec } from "./helpers";

describe("MAG Bridge", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: HardhatEthersSigner,
        user: HardhatEthersSigner,
        user2: HardhatEthersSigner,
        relayer: HardhatEthersSigner,
        tokenOnSecondChain: HardhatEthersSigner;

    let bridge: MAGBridge;
    let token: MockToken;

    const SECOND_CHAIN_ID = 0;
    const MIN_TOKEN_AMOUNT = 8n;

    const nonceEth = "ETH1";
    const nonceBsc = "BSC1";

    before(async () => {
        // Getting of signers.
        [deployer, user, user2, relayer, tokenOnSecondChain] = await ethers.getSigners();

        // Deployment of the mocks.
        const Token = await ethers.getContractFactory("MockToken", deployer);
        token = await Token.deploy("MockERC20", "ERC20", 18);
        await token.waitForDeployment();

        // Deployment of the factory.
        const Bridge = await ethers.getContractFactory("MAGBridge", deployer);
        bridge = (await upgrades.deployProxy(Bridge, [SECOND_CHAIN_ID, relayer.address])) as unknown as MAGBridge;
        await bridge.waitForDeployment();

        token.mintFor(bridge, addDec(10000));

        await bridge.addToken(token, ethers.ZeroAddress, MIN_TOKEN_AMOUNT);

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("# Withdraw", function () {
        it("Should withdraw tokens", async () => {
            const balanceBridgeBefore = await token.balanceOf(bridge);
            const balanceUserBefore = await token.balanceOf(user);

            const amount = addDec(1);

            expect(await bridge.nonceIsUsed(nonceEth)).to.be.false;

            await expect(bridge.connect(relayer).withdraw(token, user, amount, nonceEth))
                .to.emit(bridge, "Withdraw")
                .withArgs(token, ethers.ZeroAddress, user.address, amount, nonceEth);

            const balanceUserAfter = await token.balanceOf(user.address);
            const balanceBridgeAfter = await token.balanceOf(bridge);

            expect(balanceUserAfter).to.be.equal(balanceUserBefore + amount);
            expect(balanceBridgeAfter).to.be.equal(balanceBridgeBefore - amount);
            expect(await bridge.nonceIsUsed(nonceEth)).to.be.true;
        });

        it("Should revert if receiver is zero address", async () => {
            const receiver = ethers.ZeroAddress;

            await expect(
                bridge.connect(relayer).withdraw(token, receiver, addDec(1), nonceBsc)
            ).to.be.revertedWithCustomError(bridge, "ZeroAddress");
        });

        it("Should revert withdraw if token is not added", async () => {
            const notSupportedToken = await ethers.deployContract("MockToken", ["TNK", "TNK", 18]);
            await expect(bridge.connect(relayer).withdraw(notSupportedToken, user.address, addDec(1), nonceBsc))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(notSupportedToken);
        });

        it("Should revert if caller is not a relayer", async () => {
            await expect(bridge.connect(user).withdraw(token, user.address, addDec(1), nonceBsc)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is paused", async () => {
            await bridge.pause();
            await expect(bridge.connect(user).withdraw(token, user, addDec(1), nonceBsc)).to.be.revertedWith(
                "Pausable: paused"
            );
        });

        it("Should revert if nonce is already used", async () => {
            await bridge.connect(relayer).withdraw(token, user.address, addDec(1), nonceBsc);
            await expect(bridge.connect(relayer).withdraw(token, user.address, addDec(1), nonceBsc))
                .to.be.revertedWithCustomError(bridge, "NonceIsUsed")
                .withArgs(nonceBsc);
        });
    });

    describe("# Emergency withdraw", function () {
        it("Should withdraw tokens in case of emergency", async () => {
            const balanceBefore = await token.balanceOf(user);
            const bridgeBalanceBefore = await token.balanceOf(bridge);

            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(token, user, addDec(1));

            const balanceAfter = await token.balanceOf(user);
            const bridgeBalanceAfter = await token.balanceOf(bridge);

            expect(balanceAfter).to.be.equal(balanceBefore + addDec(1));
            expect(bridgeBalanceAfter).to.be.equal(bridgeBalanceBefore - addDec(1));
        });

        it("Should withdraw native in case of emergency", async () => {
            // Send 10 ether to the bridge
            await user.sendTransaction({
                to: bridge,
                value: addDec(10)
            });

            const balanceBefore = await ethers.provider.getBalance(user);

            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(ethers.ZeroAddress, user, addDec(1));

            const balanceAfter = await ethers.provider.getBalance(user);
            const bridgeBalanceAfter = await ethers.provider.getBalance(bridge);

            expect(balanceAfter).to.be.equal(balanceBefore + addDec(10));
            expect(bridgeBalanceAfter).to.be.equal(0);
        });

        it("Should revert if caller is not an owner", async () => {
            await bridge.pause();

            await expect(bridge.connect(user).emergencyWithdraw(token, user, addDec(1))).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is not paused", async () => {
            await expect(bridge.connect(deployer).emergencyWithdraw(token, user, addDec(1))).to.be.revertedWith(
                "Pausable: not paused"
            );
        });

        it("Should revert if receiver is zero address", async () => {
            await bridge.pause();

            const receiver = ethers.ZeroAddress;

            await expect(
                bridge.connect(deployer).emergencyWithdraw(token, receiver, addDec(1))
            ).to.be.revertedWithCustomError(bridge, "ZeroAddress");
        });
    });

    describe("# Utils", function () {
        it("Should unpause", async () => {
            await bridge.pause();
            expect(await bridge.paused()).to.be.true;
            await bridge.unpause();
            expect(await bridge.paused()).to.be.false;
        });

        it("Should revert if caller is not an owner", async () => {
            await expect(bridge.connect(user).pause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).unpause()).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(
                bridge.connect(user).addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"))
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).upgradeTo(token)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).setMinAmountForToken(token, ethers.parseEther("0.1"))).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).setOtherChainToken(token, tokenOnSecondChain.address)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should add token", async () => {
            const MockERC20 = await ethers.getContractFactory("MockToken", deployer);
            const newMockERC20 = await MockERC20.deploy("MockERC20", "ERC20", 18);
            const tx = await bridge.addToken(newMockERC20, user.address, ethers.parseEther("0.1"));
            expect(tx).to.emit(bridge, "AddToken").withArgs(newMockERC20, user.address, ethers.parseEther("0.1"));
            expect(await bridge.tokenIsSupported(newMockERC20)).to.be.true;
            expect(await bridge.minAmountForToken(newMockERC20)).to.be.equal(ethers.parseEther("0.1"));
        });

        it("Should revert if contract is already initialized", async () => {
            await expect(bridge.connect(user).initialize(SECOND_CHAIN_ID, relayer.address)).to.be.revertedWith(
                "Initializable: contract is already initialized"
            );
        });

        it("Should be able to upgrade contract from owner", async () => {
            const Bridge = await ethers.getContractFactory("MAGBridge", deployer);
            const newBridgeImplementation = await Bridge.deploy();
            await expect(bridge.upgradeTo(newBridgeImplementation)).to.not.be.reverted;
        });

        it("Should set new min amount for token", async () => {
            await bridge.setMinAmountForToken(token, ethers.parseEther("0.2"));
            expect(await bridge.minAmountForToken(token)).to.be.equal(ethers.parseEther("0.2"));
        });

        it("Should set new token on second chain", async () => {
            await bridge.setOtherChainToken(token, relayer.address);
            expect(await bridge.otherChainToken(token)).to.be.equal(relayer.address);
        });
    });

    describe("# Removed token", function () {
        it("Should remove token", async () => {
            const token2 = await ethers.deployContract("MockToken", ["TNK", "TNK", 18]);
            await bridge.addToken(token2, ethers.ZeroAddress, ethers.parseEther("0.1"));
            await bridge.removeToken(token2);

            const whitelistSize = await bridge.allWhitelistedTokensLength();
            await bridge.removeToken(token);
            expect(await bridge.tokenIsSupported(token)).to.be.false;
            expect(await bridge.allWhitelistedTokensLength()).to.be.equal(whitelistSize - 1n);
            const whitelist = await bridge.getAllWhitelistedTokens();
            expect(whitelist).to.not.include(token);
        });

        it("Should revert removing not supported token", async () => {
            const notSupportedToken = await ethers.deployContract("MockToken", ["TNK", "TNK", 18]);

            await expect(bridge.removeToken(notSupportedToken))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(notSupportedToken);
        });

        it("Should revert removing token by non admin caller", async () => {
            await expect(bridge.connect(user).removeToken(token)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });
    });
});
