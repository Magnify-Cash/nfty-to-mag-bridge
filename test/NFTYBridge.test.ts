import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MockToken, NFTYBridge } from "../typechain-types";
import { addDec } from "./helpers";

describe("NFTY Bridge", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: HardhatEthersSigner,
        user: HardhatEthersSigner,
        user2: HardhatEthersSigner,
        relayer: HardhatEthersSigner,
        tokenOnSecondChain: HardhatEthersSigner;

    let bridge: NFTYBridge;
    let token: MockToken;

    const SECOND_CHAIN_ID = 15551;
    const FIVE_MINUTES = 300;
    const CHAIN = "ETH-";
    before(async () => {
        // Getting of signers.
        [deployer, user, user2, relayer, tokenOnSecondChain] = await ethers.getSigners();

        // Deployment of the mocks.
        const Token = await ethers.getContractFactory("MockToken", deployer);
        token = await Token.deploy("MockERC20", "ERC20", 18);
        await token.waitForDeployment();

        // Deployment of the factory.
        const Bridge = await ethers.getContractFactory("NFTYBridge", deployer);
        bridge = (await upgrades.deployProxy(Bridge, [
            SECOND_CHAIN_ID,
            relayer.address,
            FIVE_MINUTES,
            CHAIN
        ])) as unknown as NFTYBridge;
        await bridge.waitForDeployment();

        await token.mintFor(user, addDec(10000));

        await bridge.addToken(token, tokenOnSecondChain, 8n);

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("# Send", function () {
        beforeEach(async () => {
            await bridge.setWhitelisted(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F"],
                true
            );
            await bridge.setAllocations(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F"],
                [addDec(10), addDec(10), addDec(10)]
            );
        });

        it("Should send tokens", async () => {
            const balanceBefore = await token.balanceOf(bridge);

            await token.connect(user).approve(bridge, addDec(8));
            const tx = await bridge.connect(user).send(token, user.address, addDec(8));

            const balanceAfter = await token.balanceOf(bridge);

            expect(balanceAfter).to.be.equal(balanceBefore + addDec(8));
            expect(tx)
                .to.emit(bridge, "Send")
                .withArgs(token, tokenOnSecondChain.address, user.address, addDec(8), addDec(1), CHAIN + 0);
            expect(await bridge.nonce()).to.be.equal(1);
            expect(await bridge.allocations(user.address)).to.be.equal(addDec(2));
            expect(await bridge.isWhitelisted(user.address)).to.be.true;
        });

        it("Should revert if token is not added", async () => {
            const unsupportedToken = await ethers.deployContract("MockToken", ["TKN", "TKN", 18]);

            await expect(bridge.connect(user).send(unsupportedToken, user, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(unsupportedToken);
        });

        it("Should revert if amount to send is too small", async () => {
            await token.connect(user).approve(bridge, 7);

            await expect(bridge.connect(user).send(token, user.address, 7))
                .to.be.revertedWithCustomError(bridge, "AmountIsLessThanMinimum")
                .withArgs(7n, 8n);
        });

        it("Should revert if contract is paused", async () => {
            await token.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.pause();
            await expect(bridge.connect(user).send(token, user.address, ethers.parseEther("1"))).to.be.revertedWith(
                "Pausable: paused"
            );
        });

        it("Should revert if caller is not in whitelist", async () => {
            await bridge.setWhitelisted([user.address], false);

            await expect(bridge.connect(user).send(token, user.address, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(bridge, "NotWhitelisted")
                .withArgs(user.address);
        });

        it("Should revert if receiver address on second chain is zero address", async () => {
            const receiver = ethers.ZeroAddress;

            await expect(bridge.connect(user).send(token, receiver, addDec(1))).to.be.revertedWithCustomError(
                bridge,
                "ZeroAddress"
            );
        });

        it("Should remove from whitelist when allocations becomes zero", async () => {
            await bridge.addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await token.mintFor(user.address, addDec(10));
            const balanceBefore = await token.balanceOf(bridge);
            await token.connect(user).approve(bridge, addDec(10));
            const tx = await bridge.connect(user).send(token, user.address, addDec(10));
            const balanceAfter = await token.balanceOf(bridge);
            expect(balanceAfter).to.be.equal(balanceBefore + addDec(10));

            expect(tx)
                .to.emit(bridge, "Send")
                .withArgs(token, tokenOnSecondChain.address, user.address, ethers.parseEther("1"), CHAIN + 0);

            expect(await bridge.allocations(user.address)).to.be.equal(0);
            expect(await bridge.isWhitelisted(user.address)).to.be.false;
        });

        it("Should revert when sending amount is greater than allocations", async () => {
            await bridge.addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await token.mintFor(user.address, ethers.parseEther("11"));
            const balanceBefore = await token.balanceOf(bridge);
            await token.connect(user).approve(bridge, ethers.parseEther("11"));

            await expect(
                bridge.connect(user).send(token, user.address, ethers.parseEther("11"))
            ).to.be.revertedWithCustomError(bridge, "InsufficientAmountToSend");
        });
    });

    describe("# Refund", function () {
        beforeEach(async () => {
            await bridge.setWhitelisted(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F"],
                true
            );
            await bridge.setAllocations(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F"],
                [addDec(10), addDec(10), addDec(10)]
            );
        });

        it("Should allow to block refund", async () => {
            await token.connect(user).approve(bridge, addDec(1));
            await bridge.connect(user).send(token, user2, addDec(1));

            await expect(bridge.connect(relayer).blockRefund(0)).to.emit(bridge, "BlockRefund").withArgs(0);
            expect(await bridge.nonceIsBlockedForRefund(0)).to.be.true;
        });

        it("Should revert if caller is not relayer", async () => {
            await expect(bridge.connect(user).blockRefund(0)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if refund is already blocked", async () => {
            await token.connect(user).approve(bridge, addDec(1));
            await bridge.connect(user).send(token, user2, addDec(1));

            await expect(bridge.connect(relayer).blockRefund(0)).to.emit(bridge, "BlockRefund").withArgs(0);
            expect(await bridge.nonceIsBlockedForRefund(0)).to.be.true;

            await expect(bridge.connect(relayer).blockRefund(0))
                .to.be.revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should allow to refund", async () => {
            const nonceNumber = 0;
            const amount = addDec(1);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            const userBalance = await token.balanceOf(user);
            const allocations = await bridge.allocations(user);

            await time.increase(time.duration.minutes(5));

            await expect(bridge.connect(user).refund(0))
                .to.emit(bridge, "Refund")
                .withArgs(token, receiver, amount, nonceNumber);

            expect(await token.balanceOf(user)).to.be.equal(userBalance + amount);
            expect(await bridge.allocations(user)).to.be.equal(allocations + amount);
            expect(await bridge.nonceIsRefunded(nonceNumber)).to.be.true;

            // Check that relayer can not make block refund
            await expect(bridge.connect(relayer).blockRefund(0))
                .to.be.revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(nonceNumber);
        });

        it("Should revert if nonce is already refunded", async () => {
            const nonceNumber = 0;
            const amount = addDec(1);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            await time.increase(time.duration.minutes(5));

            await expect(bridge.connect(user).refund(0))
                .to.emit(bridge, "Refund")
                .withArgs(token, receiver, amount, nonceNumber);

            // Refund again from relayer
            await expect(bridge.connect(relayer).refund(0))
                .to.be.revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(nonceNumber);
        });

        it("Should revert is nonce is block for refund", async () => {
            const nonceNumber = 0;
            const amount = addDec(1);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            await bridge.connect(relayer).blockRefund(nonceNumber);

            await expect(bridge.connect(user).refund(0))
                .to.be.revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(nonceNumber);
        });

        it("Should revert if min time to refund is not passed", async () => {
            const amount = addDec(1);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            await expect(bridge.connect(user).refund(0)).to.be.revertedWithCustomError(
                bridge,
                "MinTimeToRefundIsNotReached"
            );
        });

        it("Should revert if caller is not relayer or owner of nonce", async () => {
            const nonceNumber = 0;
            const amount = addDec(1);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            await time.increase(time.duration.minutes(5));

            await expect(bridge.connect(user2).refund(0))
                .to.be.revertedWithCustomError(bridge, "OnlyRelayerOrCreatorCanRefund")
                .withArgs(nonceNumber);
        });

        it("Should allow to make refund from admin or relayer", async () => {
            const nonceNumber = 0;
            const nonceNumber2 = 1;
            const amount = addDec(1);
            const receiver = user2.address;

            const userBalance = await token.balanceOf(user);

            await token.connect(user).approve(bridge, amount * 2n);
            await bridge.connect(user).send(token, receiver, amount);
            await bridge.connect(user).send(token, receiver, amount);

            await time.increase(time.duration.minutes(5));

            // Try to refund from relayer
            await expect(bridge.connect(relayer).refund(nonceNumber))
                .to.emit(bridge, "Refund")
                .withArgs(token, receiver, amount, nonceNumber);
            await expect(bridge.connect(deployer).refund(nonceNumber2))
                .to.emit(bridge, "Refund")
                .withArgs(token, receiver, amount, nonceNumber2);

            expect(await token.balanceOf(user)).to.be.equal(userBalance);
        });

        it("Should set whitelisted back if user sent all allocation and make refund", async () => {
            const nonceNumber = 0;
            const amount = addDec(10);
            const receiver = user2.address;

            await token.connect(user).approve(bridge, amount);
            await bridge.connect(user).send(token, receiver, amount);

            expect(await bridge.isWhitelisted(user)).to.be.equal(false);

            await time.increase(time.duration.minutes(5));

            await expect(bridge.connect(user).refund(nonceNumber))
                .to.emit(bridge, "Refund")
                .withArgs(token, receiver, amount, nonceNumber);
            expect(await bridge.isWhitelisted(user)).to.be.equal(true);
        });
    });

    describe("# Emergency withdraw", function () {
        it("Should withdraw tokens in case of emergency", async () => {
            await token.mintFor(bridge, addDec(10));

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

            await expect(bridge.connect(user).setTimeToWaitBeforeRefund(100)).to.be.revertedWith(
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
            const token = await ethers.getContractFactory("MockToken", deployer);
            const newtoken = await token.deploy("token", "ERC20", 18);
            const tx = await bridge.addToken(newtoken, user.address, ethers.parseEther("0.1"));
            expect(tx).to.emit(bridge, "AddToken").withArgs(newtoken, user.address, ethers.parseEther("0.1"));
            expect(await bridge.tokenIsSupported(newtoken)).to.be.true;
            expect(await bridge.minAmountForToken(newtoken)).to.be.equal(ethers.parseEther("0.1"));
        });

        it("Should revert if contract is already initialized", async () => {
            await expect(bridge.connect(user).initialize(2, relayer, FIVE_MINUTES, CHAIN)).to.be.revertedWith(
                "Initializable: contract is already initialized"
            );
        });

        it("Should be able to upgrade contract from owner", async () => {
            const Bridge = await ethers.getContractFactory("NFTYBridge", deployer);
            const newBridgeImplementation = await Bridge.deploy();
            await expect(bridge.upgradeTo(newBridgeImplementation)).to.not.be.reverted;
        });

        it("Should set new min time to wait before refund", async () => {
            await bridge.setTimeToWaitBeforeRefund(100);
            expect(await bridge.minTimeToWaitBeforeRefund()).to.be.equal(100);
        });

        it("Should revert set new min time to wait before refund if new value is too big", async () => {
            await expect(bridge.setTimeToWaitBeforeRefund(10000000))
                .to.be.revertedWithCustomError(bridge, "MinTimeToWaitBeforeRefundIsTooBig")
                .withArgs(10000000);
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
        beforeEach(async () => {
            await bridge.setWhitelisted(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F", deployer.address],
                true
            );
            await bridge.setAllocations(
                [user.address, user2.address, "0x0165878A594ca255338adfa4d48449f69242Eb8F", deployer.address],
                [addDec(10), addDec(10), addDec(10), addDec(10)]
            );
        });

        it("Should remove token", async () => {
            const newToken = await ethers.deployContract("MockToken", ["token", "ERC20", 18], deployer);
            await bridge.addToken(newToken, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            expect(await bridge.tokenIsSupported(newToken)).to.be.true;

            await bridge.removeToken(newToken);
            expect(await bridge.tokenIsSupported(newToken)).to.be.false;

            await bridge.addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            const whitelistSize = await bridge.allWhitelistedTokensLength();
            await bridge.removeToken(token);
            expect(await bridge.tokenIsSupported(token)).to.be.false;
            expect(await bridge.allWhitelistedTokensLength()).to.be.equal(whitelistSize - 1n);
            const whitelist = await bridge.getAllWhitelistedTokens();
            expect(whitelist).to.not.include(token);
        });

        it("Should not send removed token", async () => {
            await bridge.addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await bridge.removeToken(token);
            await expect(bridge.send(token, user.address, ethers.parseEther("0.1")))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(token);
        });

        it("Should still refund send even if tokens is not already supported", async () => {
            await bridge.addToken(token, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await token.mintFor(user.address, ethers.parseEther("1"));
            await token.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(token, user.address, ethers.parseEther("1"));
            await bridge.removeToken(token);
            // wait min time before refund
            await time.increase(time.duration.minutes(5));
            await expect(bridge.connect(user).refund((await bridge.nonce()) - 1n)).to.not.be.reverted;
        });

        it("Should revert removing not supported token", async () => {
            const unsupportedToken = await ethers.deployContract("MockToken", ["TKN", "TKN", 18]);
            await expect(bridge.removeToken(unsupportedToken))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(unsupportedToken);
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

    describe("# Whitelist controller", function () {
        it("Should allow to add users to whitelist", async () => {
            const whitelist = [user, user2];
            const isWhitelisted = true;

            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);

            expect(await bridge.isWhitelisted(user.address)).to.be.equal(isWhitelisted);
            expect(await bridge.isWhitelisted(user2.address)).to.be.equal(isWhitelisted);
        });

        it("Should allow to remove users from whitelist", async () => {
            const whitelist = [user, user2];
            let isWhitelisted = true;

            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);

            expect(await bridge.isWhitelisted(user.address)).to.be.equal(isWhitelisted);
            expect(await bridge.isWhitelisted(user2.address)).to.be.equal(isWhitelisted);

            isWhitelisted = false;
            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);

            expect(await bridge.isWhitelisted(user.address)).to.be.equal(isWhitelisted);
            expect(await bridge.isWhitelisted(user2.address)).to.be.equal(isWhitelisted);
        });

        it("Should allow to set allocations to users", async () => {
            const whitelist = [user, user2];
            const isWhitelisted = true;
            const allocations = [addDec(0.1), addDec(0.2)];

            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);
            await bridge.connect(deployer).setAllocations(whitelist, allocations);

            expect(await bridge.allocations(user.address)).to.be.equal(allocations[0]);
            expect(await bridge.allocations(user2.address)).to.be.equal(allocations[1]);
        });

        it("Should revert if allocations already set", async () => {
            const whitelist = [user];
            const isWhitelisted = true;
            const allocations = [addDec(0.1)];

            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);
            await bridge.connect(deployer).setAllocations(whitelist, allocations);

            // Set allocations again
            await expect(bridge.connect(deployer).setAllocations(whitelist, allocations))
                .to.be.revertedWithCustomError(bridge, "AllocationsAlreadySet")
                .withArgs(whitelist[0]);
        });

        it("Should revert if amount of allocations is equal to zero", async () => {
            const whitelist = [user, user2];
            const isWhitelisted = true;
            const allocations = [addDec(0.1), 0];

            await bridge.connect(deployer).setWhitelisted(whitelist, isWhitelisted);
            await expect(bridge.connect(deployer).setAllocations(whitelist, allocations)).to.be.revertedWithCustomError(
                bridge,
                "ZeroAmount"
            );
        });

        it("Should revert if user is not whitelisted during allocations setting", async () => {
            const whitelist = [user];
            const allocations = [addDec(0.1)];

            await expect(bridge.connect(deployer).setAllocations(whitelist, allocations))
                .to.be.revertedWithCustomError(bridge, "NotWhitelisted")
                .withArgs(whitelist[0].address);
        });

        it("Should revert if caller is not admin", async () => {
            const whitelist = [user, user2];
            const allocations = [addDec(0.1), addDec(0.2)];
            const isWhitelisted = true;

            // Expect revert on setWhitelisted function
            await expect(bridge.connect(user).setWhitelisted(whitelist, isWhitelisted)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            // Expect revert on setAllocations function
            await expect(bridge.connect(user).setAllocations(whitelist, allocations)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if length of accounts and allocations are equal", async () => {
            const whitelist = [user, user2];
            const allocations = [addDec(0.1), addDec(0.2), addDec(1)];

            await expect(bridge.setAllocations(whitelist, allocations)).to.be.revertedWithCustomError(
                bridge,
                "LengthMismatch"
            );
        });
    });
});
