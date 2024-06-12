import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import { takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import {BigNumber} from "ethers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Bridge, MockToken, WrappedNative } from "../typechain-types";

describe("Bridge", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: SignerWithAddress,
        user: SignerWithAddress,
        user2: SignerWithAddress,
        relayer: SignerWithAddress,
        tokenOnSecondChain: SignerWithAddress;

    let bridge: Bridge;
    let mockERC20: MockToken;
    let mockNative: WrappedNative;

    const FIVE_MINUTES = 300;
    before(async () => {
        // Getting of signers.
        [deployer, user, user2, relayer, tokenOnSecondChain] = await ethers.getSigners();

        // Deployment of the mocks.
        const MockERC20 = await ethers.getContractFactory("MockToken", deployer);
        mockERC20 = await MockERC20.deploy("MockERC20", "ERC20", 18);
        await mockERC20.deployed();

        const WrappedNative = await ethers.getContractFactory("WrappedNative", deployer);
        mockNative = await WrappedNative.deploy("WrappedNative", "NATIVE");

        // Deployment of the factory.
        const Bridge = await ethers.getContractFactory("Bridge", deployer);
        bridge = (await upgrades.deployProxy(Bridge, [
            15551,
            mockNative.address,
            ethers.utils.parseEther("0.1"),
            tokenOnSecondChain.address,
            relayer.address,
            FIVE_MINUTES
        ])) as Bridge;
        await bridge.deployed();

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("# Send", function () {
        it("Should send tokens", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(bridge.address);
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            const tx = await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            const receipt = await tx.wait();
            const balanceAfter = await mockERC20.balanceOf(bridge.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            const event = receipt?.events?.find(event => event.event === "Send");
            expect(event).to.not.be.undefined;
            expect(event?.args?.token).to.be.equal(mockERC20.address);
            expect(event?.args?.tokenOnSecondChain).to.be.equal(tokenOnSecondChain.address);
            expect(event?.args?.to).to.be.equal(user.address);
            expect(event?.args?.amount).to.be.equal(ethers.utils.parseEther("1"));
            expect(event?.args?.nonce).to.be.equal(0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should send native", async() => {
            const balanceBefore = await ethers.provider.getBalance(bridge.address);
            const tx = await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            const receipt = await tx.wait();
            const balanceAfter = await ethers.provider.getBalance(bridge.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            const event = receipt?.events?.find(event => event.event === "Send");
            expect(event).to.not.be.undefined;
            expect(event?.args?.token).to.be.equal(mockNative.address);
            expect(event?.args?.tokenOnSecondChain).to.be.equal(tokenOnSecondChain.address);
            expect(event?.args?.to).to.be.equal(user.address);
            expect(event?.args?.amount).to.be.equal(ethers.utils.parseEther("1"));
            expect(event?.args?.nonce).to.be.equal(0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should revert if amount is not equal to msg.value", async() => {
            await expect(bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("0.1")}
            )).to.be.revertedWithCustomError(bridge, "AmountIsNotEqualToMsgValue")
            .withArgs(ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1"));
        });

        it("Should revert if token is not added", async() => {
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await expect(bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1")))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20.address);
        });

        it("Should revert if amount to send is too small", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await expect(bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("0.01")))
                .to.be
                .revertedWithCustomError(bridge, "AmountIsLessThanMinimum")
                .withArgs(
                    ethers.utils.parseEther("0.01"),
                    ethers.utils.parseEther("0.1")
                );
        });

        it("Should revert if contract is paused", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.pause();
            await expect(bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1")))
                .to.be.revertedWith("Pausable: paused");
        });

        it("Should revert if send tokens but with msg.value > 0", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await expect(bridge.connect(user).send(
                mockERC20.address, user.address, ethers.utils.parseEther("1"), {value: ethers.utils.parseEther("1")}
            )).to.be.revertedWithCustomError(bridge, "MsgValueShouldBeZero");
        });

        it("Should revert if send native to receiver is failed", async() => {
            const MockReceiver = await ethers.getContractFactory("MockReceiver");
            const mockReceiver = await MockReceiver.deploy();
            await mockReceiver.connect(user).sendNativeToBridge(
                bridge.address,
                mockNative.address,
                {value: ethers.utils.parseEther("1")}
            );
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                bridge.connect(relayer).refund(0)).to.be.revertedWithCustomError(bridge, "FailedToSendEther");

            await expect(
                bridge.connect(relayer).withdraw(
                    mockNative.address,
                    mockReceiver.address,
                    ethers.utils.parseEther("1"),
                    0
                )).to.be.revertedWithCustomError(bridge, "FailedToSendEther");

            await bridge.pause();
            await expect(
                bridge.connect(deployer).emergencyWithdraw(
                    mockNative.address,
                    mockReceiver.address,
                    ethers.utils.parseEther("1"),
                )
            ).to.be.revertedWithCustomError(bridge, "FailedToSendEther");
        });
    });

    describe("# Withdraw", function () {
        async function sendTokens(
            _bridge: Bridge,
            _mockERC20: MockToken,
            _user: SignerWithAddress,
            _amount: BigNumber
        ) {
            await _mockERC20.mintFor(_user.address, _amount);
            await _mockERC20.connect(_user).approve(_bridge.address, _amount);
            await _bridge.connect(_user).send(
                _mockERC20.address,
                _user.address,
                _amount
            );
        }

        async function sendNative(
            _bridge: Bridge,
            _mockERC20: WrappedNative,
            _user: SignerWithAddress,
            _amount: BigNumber
        ) {
            await _bridge.connect(_user).send(
                _mockERC20.address,
                _user.address,
                _amount,
                {value: _amount}
            );
        }

        it("Should withdraw tokens", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await sendTokens(bridge, mockERC20, user, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            const tx = await bridge.connect(relayer).withdraw(
                mockERC20.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            );
            const receipt = await tx.wait();
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            const event = receipt?.events?.find(event => event.event === "Withdraw");
            expect(event).to.not.be.undefined;
            expect(event?.args?.token).to.be.equal(mockERC20.address);
            expect(event?.args?.tokenOnSecondChain).to.be.equal(tokenOnSecondChain.address);
            expect(event?.args?.to).to.be.equal(user.address);
            expect(event?.args?.amount).to.be.equal(ethers.utils.parseEther("1"));
            expect(event?.args?.nonce).to.be.equal(0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should withdraw native", async() => {
            await sendNative(bridge, mockNative, user, ethers.utils.parseEther("1"));
            const balanceBefore = await ethers.provider.getBalance(user.address);
            const tx = await bridge.connect(relayer).withdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            );
            const receipt = await tx.wait();
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(
                balanceBefore.add(ethers.utils.parseEther("1"))
            );
            const event = receipt?.events?.find(event => event.event === "Withdraw");
            expect(event).to.not.be.undefined;
            expect(event?.args?.token).to.be.equal(mockNative.address);
            expect(event?.args?.tokenOnSecondChain).to.be.equal(tokenOnSecondChain.address);
            expect(event?.args?.to).to.be.equal(user.address);
            expect(event?.args?.amount).to.be.equal(ethers.utils.parseEther("1"));
            expect(event?.args?.nonce).to.be.equal(0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should revert withdraw if token is not added", async() => {
            await expect(bridge.connect(relayer).withdraw(
                mockERC20.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            )).to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
            .withArgs(mockERC20.address);
        });

        it("Should revert if caller is not a relayer", async() => {
            await sendNative(bridge, mockNative, user, ethers.utils.parseEther("1"));
            await expect(bridge.connect(user).withdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is paused", async() => {
            await bridge.pause();
            await expect(bridge.connect(user).withdraw(
                mockERC20.address,
                user.address,
                ethers.utils.parseEther("1"),
                1
            )).to.be.revertedWith("Pausable: paused");
        });

        it("Should revert if nonce is already used", async() => {
            await sendNative(bridge, mockNative, user, ethers.utils.parseEther("1"));
            await bridge.connect(relayer).withdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            );
            await expect(bridge.connect(relayer).withdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                0
            )).to.be.revertedWithCustomError(bridge, "NonceIsUsed")
            .withArgs(0);
        });
    });

    describe("# Emergency withdraw", function () {
        it("Should withdraw tokens in case of emergency", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(
                mockERC20.address,
                user.address,
                ethers.utils.parseEther("1")
            );
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            expect(await mockERC20.balanceOf(bridge.address)).to.be.equal(0);
        });

        it("Should withdraw native in case of emergency", async() => {
            await user.sendTransaction({
                to: bridge.address,
                value: ethers.utils.parseEther("1")
            });
            const balanceBefore = await ethers.provider.getBalance(user.address);
            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1")
            );
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(
                balanceBefore.add(ethers.utils.parseEther("1"))
            );
            expect(await ethers.provider.getBalance(bridge.address)).to.be.equal(0);
        });

        it("Should revert if caller is not an owner", async() => {
            await bridge.pause();
            await expect(bridge.connect(user).emergencyWithdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1")
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is not paused", async() => {
            await expect(bridge.connect(deployer).emergencyWithdraw(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1")
            )).to.be.revertedWith("Pausable: not paused");
        });
    });

    describe("# Refund", function () {
        it("Should refund tokens if refunder is user that created send.", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            expect(await mockERC20.balanceOf(bridge.address)).to.be.equal(0);
        });

        it("Should refund tokens if refunder is admin and refund is blocked.", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(deployer).refund(0);
            const balanceAfRefundIsBlockedter = await mockERC20.balanceOf(user.address);
            expect(balanceAfRefundIsBlockedter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            expect(await mockERC20.balanceOf(bridge.address)).to.be.equal(0);
        });

        it("Should refund tokens if refunder is relayer and refund is blocked.", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(relayer).blockRefund(0);
            await bridge.connect(relayer).refund(0);
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseEther("1")));
            expect(await mockERC20.balanceOf(bridge.address)).to.be.equal(0);
        });

        it("Should refund native", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            const balanceBefore = await ethers.provider.getBalance(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(relayer).refund(0);
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(
                balanceBefore.add(ethers.utils.parseEther("1"))
            );
            expect(await ethers.provider.getBalance(bridge.address)).to.be.equal(0);
        });

        it("Should block refund if refunder is user", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(user).refund(0)).to.be
                .revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert block refund if it is already blocked and refunder is user.", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(relayer).blockRefund(0)).to.be
                .revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert block refund if it is already refunded and refunder is user.", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            await expect(bridge.connect(relayer).blockRefund(0)).to.be
                .revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(0);
        });

        it("Should revert block refund if is already blocked even if the relayer calls.", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(relayer).blockRefund(0)).to.be
                .revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert refund if it is already refunded", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            await expect(bridge.connect(user).refund(0)).to.be
                .revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(0);
        });

        it("Should revert if time before refund is not reached", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await expect(bridge.connect(user).refund(0)).to.be
                .revertedWithCustomError(bridge, "MinTimeToRefundIsNotReached");
        });

        it("Should revert caller is not an admin, creator or relayer", async() => {
            await bridge.connect(user2).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await expect(bridge.connect(user).refund(0)).to.be
                .revertedWithCustomError(bridge, "OnlyRelayerOrCreatorCanRefund")
                .withArgs(0);
        });


        it("Should revert blockRefund if caller is not a relayer", async() => {
            await bridge.connect(user).send(
                mockNative.address,
                user.address,
                ethers.utils.parseEther("1"),
                {value: ethers.utils.parseEther("1")}
            );
            await expect(bridge.connect(user).blockRefund(0)).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should be possible to add same wrapped native twice", async() => {
            let wrappedNative = await bridge.wrappedNative();
            await bridge.connect(deployer).setNewWrappedNative(
                wrappedNative
            );
            await bridge.connect(deployer).setNewWrappedNative(
                wrappedNative
            );
            expect(await bridge.tokenIsSupported(wrappedNative)).to.be.true;
        });
    });

    describe("# Utils", function () {
        it("Should unpause", async() => {
            await bridge.pause();
            expect(await bridge.paused()).to.be.true;
            await bridge.unpause();
            expect(await bridge.paused()).to.be.false;
        });

        it("Should revert if caller is not an owner", async() => {
            await expect(bridge.connect(user).pause()).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).unpause()).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).addToken(
                mockERC20.address,
                tokenOnSecondChain.address,
                ethers.utils.parseEther("0.1")
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).upgradeTo(
                mockERC20.address
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).setTimeToWaitBeforeRefund(
                    100
                )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).setMinAmountForToken(
                mockERC20.address,
                ethers.utils.parseEther("0.1")
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).setOtherChainToken(
                mockERC20.address,
                tokenOnSecondChain.address
            )).to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should add token", async() => {
            const MockERC20 = await ethers.getContractFactory("MockToken", deployer);
            const newMockERC20 = await MockERC20.deploy("MockERC20", "ERC20", 18);
            const tx = await bridge.addToken(newMockERC20.address, user.address, ethers.utils.parseEther("0.1"));
            const receipt = await tx.wait();
            const event = receipt?.events?.find(event => event.event === "AddToken");
            expect(event?.args?.token).to.be.equal(newMockERC20.address);
            expect(event?.args?.tokenOnSecondChain).to.be.equal(user.address);
            expect(event?.args?.minAmount).to.be.equal(ethers.utils.parseEther("0.1"));
            expect(await bridge.tokenIsSupported(newMockERC20.address)).to.be.true;
            expect(await bridge.minAmountForToken(newMockERC20.address)).to.be.equal(ethers.utils.parseEther("0.1"));
        });

        it("Should revert if contract is already initialized", async() => {
            await expect(bridge.connect(user).initialize(
                2,
                mockNative.address,
                ethers.utils.parseEther("0.1"),
                tokenOnSecondChain.address,
                relayer.address,
                FIVE_MINUTES
            )).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should be able to upgrade contract from owner", async() => {
            const Bridge = await ethers.getContractFactory("Bridge", deployer);
            const newBridgeImplementation = await Bridge.deploy();
            await expect(bridge.upgradeTo(newBridgeImplementation.address)).to.not.be.reverted;
        });

        it("Should set new min time to wait before refund", async() => {
            await bridge.setTimeToWaitBeforeRefund(100);
            expect(await bridge.minTimeToWaitBeforeRefund()).to.be.equal(100);
        });

        it("Should revert set new min time to wait before refund if new value is too big", async() => {
            await expect(bridge.setTimeToWaitBeforeRefund(10000000))
                .to.be.revertedWithCustomError(bridge, "MinTimeToWaitBeforeRefundIsTooBig")
                .withArgs(10000000);
        });

        it("Should set new min amount for token", async() => {
            await bridge.setMinAmountForToken(mockNative.address, ethers.utils.parseEther("0.2"));
            expect(await bridge.minAmountForToken(mockNative.address)).to.be.equal(ethers.utils.parseEther("0.2"));
        });

        it("Should set new token on second chain", async() => {
            await bridge.setOtherChainToken(mockNative.address, relayer.address);
            expect(await bridge.otherChainToken(mockNative.address)).to.be.equal(relayer.address);
        });
    });

    describe("# Removed token", function () {
        it("Should remove token", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            const whitelistSize = await bridge.allWhitelistedTokensLength();
            await bridge.removeToken(mockERC20.address);
            expect(await bridge.tokenIsSupported(mockERC20.address)).to.be.false;
            expect(await bridge.allWhitelistedTokensLength()).to.be.equal(whitelistSize.sub(1));
            const whitelist = await bridge.getAllWhitelistedTokens();
            expect(whitelist).to.not.include(mockERC20.address);
        });

        it("Should not send removed token", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await bridge.removeToken(mockERC20.address);
            await expect(bridge.send(
                mockERC20.address,
                user.address,
                ethers.utils.parseEther("0.1")
            )).to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20.address);
        });

        it("Should still refund send even if tokens is not already supported", async() => {
            await bridge.addToken(mockERC20.address, tokenOnSecondChain.address, ethers.utils.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.utils.parseEther("1"));
            await mockERC20.connect(user).approve(bridge.address, ethers.utils.parseEther("1"));
            await bridge.connect(user).send(mockERC20.address, user.address, ethers.utils.parseEther("1"));
            await bridge.removeToken(mockERC20.address);
            // wait min time before refund
            await ethers.provider.send(
                "evm_increaseTime",
                [(await bridge.minTimeToWaitBeforeRefund()).toNumber()]
            );
            await ethers.provider.send("evm_mine", []);
            await expect(bridge.connect(user).refund(
                (await bridge.nonce()).sub(1)
            )).to.not.be.reverted;
        });

        it("Should revert removing not supported token", async() => {
            await expect(bridge.removeToken(mockERC20.address))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20.address);
        });

        it("Should revert removing token by non admin caller", async() => {
            await expect(bridge.connect(user).removeToken(mockERC20.address))
                .to.be.revertedWith(
                    "AccessControl: account"
                    +" "
                    +user.address.toLocaleLowerCase()
                    +" is missing role "
                    +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
                );
        });
    });

    it("Should set new wrapped native", async() => {
        const MockERC20 = await ethers.getContractFactory("MockToken", deployer);
        const newMockERC20 = await MockERC20.deploy("MockERC20", "ERC20", 18);
        await bridge.setNewWrappedNative(newMockERC20.address);
        expect(await bridge.wrappedNative()).to.be.equal(newMockERC20.address);
    });

    it("Should revert set new wrapped native from non admin caller", async() => {
        await expect(bridge.connect(user).setNewWrappedNative(mockNative.address))
            .to.be.revertedWith(
                "AccessControl: account"
                +" "
                +user.address.toLocaleLowerCase()
                +" is missing role "
                +(await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
    });
});
