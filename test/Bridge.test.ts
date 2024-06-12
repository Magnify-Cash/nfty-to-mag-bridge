import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Bridge, MockToken, WrappedNative } from "../typechain-types";

describe("Bridge", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: HardhatEthersSigner,
        user: HardhatEthersSigner,
        user2: HardhatEthersSigner,
        relayer: HardhatEthersSigner,
        tokenOnSecondChain: HardhatEthersSigner;

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
        await mockERC20.waitForDeployment();

        const WrappedNative = await ethers.getContractFactory("WrappedNative", deployer);
        mockNative = await WrappedNative.deploy("WrappedNative", "NATIVE");

        // Deployment of the factory.
        const Bridge = await ethers.getContractFactory("Bridge", deployer);
        bridge = (await upgrades.deployProxy(Bridge, [
            15551,
            mockNative.target,
            ethers.parseEther("0.1"),
            tokenOnSecondChain.address,
            relayer.address,
            FIVE_MINUTES
        ])) as unknown as Bridge;
        await bridge.waitForDeployment();

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());

    describe("# Send", function () {
        it("Should send tokens", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(bridge);
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            const tx = await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            const receipt = await tx.wait();
            const balanceAfter = await mockERC20.balanceOf(bridge);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));

            expect(tx)
                .to.emit(bridge, "Send")
                .withArgs(mockERC20, tokenOnSecondChain.address, user.address, ethers.parseEther("1"), 0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should send native", async () => {
            const balanceBefore = await ethers.provider.getBalance(bridge);
            const tx = await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            const receipt = await tx.wait();
            const balanceAfter = await ethers.provider.getBalance(bridge);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(tx)
                .to.emit(bridge, "Send")
                .withArgs(mockNative, tokenOnSecondChain.address, user.address, ethers.parseEther("1"), 0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should revert if amount is not equal to msg.value", async () => {
            await expect(
                bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                    value: ethers.parseEther("0.1")
                })
            )
                .to.be.revertedWithCustomError(bridge, "AmountIsNotEqualToMsgValue")
                .withArgs(ethers.parseEther("1"), ethers.parseEther("0.1"));
        });

        it("Should revert if token is not added", async () => {
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await expect(bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20);
        });

        it("Should revert if amount to send is too small", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await expect(bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("0.01")))
                .to.be.revertedWithCustomError(bridge, "AmountIsLessThanMinimum")
                .withArgs(ethers.parseEther("0.01"), ethers.parseEther("0.1"));
        });

        it("Should revert if contract is paused", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.pause();
            await expect(bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"))).to.be.revertedWith(
                "Pausable: paused"
            );
        });

        it("Should revert if send tokens but with msg.value > 0", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await expect(
                bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"), {
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWithCustomError(bridge, "MsgValueShouldBeZero");
        });

        it("Should revert if send native to receiver is failed", async () => {
            const MockReceiver = await ethers.getContractFactory("MockReceiver");
            const mockReceiver = await MockReceiver.deploy();
            await mockReceiver.connect(user).sendNativeToBridge(bridge, mockNative, { value: ethers.parseEther("1") });
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);

            await expect(bridge.connect(relayer).refund(0)).to.be.revertedWithCustomError(bridge, "FailedToSendEther");

            await expect(
                bridge.connect(relayer).withdraw(mockNative, mockReceiver, ethers.parseEther("1"), 0)
            ).to.be.revertedWithCustomError(bridge, "FailedToSendEther");

            await bridge.pause();
            await expect(
                bridge.connect(deployer).emergencyWithdraw(mockNative, mockReceiver, ethers.parseEther("1"))
            ).to.be.revertedWithCustomError(bridge, "FailedToSendEther");
        });
    });

    describe("# Withdraw", function () {
        async function sendTokens(_bridge: Bridge, _mockERC20: MockToken, _user: HardhatEthersSigner, _amount: bigint) {
            await _mockERC20.mintFor(_user.address, _amount);
            await _mockERC20.connect(_user).approve(_bridge, _amount);
            await _bridge.connect(_user).send(_mockERC20, _user.address, _amount);
        }

        async function sendNative(
            _bridge: Bridge,
            _mockERC20: WrappedNative,
            _user: HardhatEthersSigner,
            _amount: bigint
        ) {
            await _bridge.connect(_user).send(_mockERC20, _user.address, _amount, { value: _amount });
        }

        it("Should withdraw tokens", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await sendTokens(bridge, mockERC20, user, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            const tx = await bridge.connect(relayer).withdraw(mockERC20, user.address, ethers.parseEther("1"), 0);
            const receipt = await tx.wait();
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(tx).to.emit(bridge, "Withdraw").withArgs(mockERC20, user.address, ethers.parseEther("1"), 0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should withdraw native", async () => {
            await sendNative(bridge, mockNative, user, ethers.parseEther("1"));
            const balanceBefore = await ethers.provider.getBalance(user.address);
            const tx = await bridge.connect(relayer).withdraw(mockNative, user.address, ethers.parseEther("1"), 0);
            const receipt = await tx.wait();
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(tx).to.emit(bridge, "Withdraw").withArgs(mockNative, user.address, ethers.parseEther("1"), 0);
            expect(await bridge.nonce()).to.be.equal(1);
        });

        it("Should revert withdraw if token is not added", async () => {
            await expect(bridge.connect(relayer).withdraw(mockERC20, user.address, ethers.parseEther("1"), 0))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20);
        });

        it("Should revert if caller is not a relayer", async () => {
            await sendNative(bridge, mockNative, user, ethers.parseEther("1"));
            await expect(
                bridge.connect(user).withdraw(mockNative, user.address, ethers.parseEther("1"), 0)
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is paused", async () => {
            await bridge.pause();
            await expect(
                bridge.connect(user).withdraw(mockERC20, user.address, ethers.parseEther("1"), 1)
            ).to.be.revertedWith("Pausable: paused");
        });

        it("Should revert if nonce is already used", async () => {
            await sendNative(bridge, mockNative, user, ethers.parseEther("1"));
            await bridge.connect(relayer).withdraw(mockNative, user.address, ethers.parseEther("1"), 0);
            await expect(bridge.connect(relayer).withdraw(mockNative, user.address, ethers.parseEther("1"), 0))
                .to.be.revertedWithCustomError(bridge, "NonceIsUsed")
                .withArgs(0);
        });
    });

    describe("# Emergency withdraw", function () {
        it("Should withdraw tokens in case of emergency", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(mockERC20, user.address, ethers.parseEther("1"));
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await mockERC20.balanceOf(bridge)).to.be.equal(0);
        });

        it("Should withdraw native in case of emergency", async () => {
            await user.sendTransaction({
                to: bridge,
                value: ethers.parseEther("1")
            });
            const balanceBefore = await ethers.provider.getBalance(user.address);
            await bridge.pause();
            await bridge.connect(deployer).emergencyWithdraw(mockNative, user.address, ethers.parseEther("1"));
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await ethers.provider.getBalance(bridge)).to.be.equal(0);
        });

        it("Should revert if caller is not an owner", async () => {
            await bridge.pause();
            await expect(
                bridge.connect(user).emergencyWithdraw(mockNative, user.address, ethers.parseEther("1"))
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should revert if contract is not paused", async () => {
            await expect(
                bridge.connect(deployer).emergencyWithdraw(mockNative, user.address, ethers.parseEther("1"))
            ).to.be.revertedWith("Pausable: not paused");
        });
    });

    describe("# Refund", function () {
        it("Should refund tokens if refunder is user that created send.", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await mockERC20.balanceOf(bridge)).to.be.equal(0);
        });

        it("Should refund tokens if refunder is admin and refund is blocked.", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(deployer).refund(0);
            const balanceAfRefundIsBlockedter = await mockERC20.balanceOf(user.address);
            expect(balanceAfRefundIsBlockedter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await mockERC20.balanceOf(bridge)).to.be.equal(0);
        });

        it("Should refund tokens if refunder is relayer and refund is blocked.", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            const balanceBefore = await mockERC20.balanceOf(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(relayer).blockRefund(0);
            await bridge.connect(relayer).refund(0);
            const balanceAfter = await mockERC20.balanceOf(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await mockERC20.balanceOf(bridge)).to.be.equal(0);
        });

        it("Should refund native", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            const balanceBefore = await ethers.provider.getBalance(user.address);
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(relayer).refund(0);
            const balanceAfter = await ethers.provider.getBalance(user.address);
            expect(balanceAfter).to.be.equal(balanceBefore + ethers.parseEther("1"));
            expect(await ethers.provider.getBalance(bridge)).to.be.equal(0);
        });

        it("Should block refund if refunder is user", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(user).refund(0))
                .to.be.revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert block refund if it is already blocked and refunder is user.", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(relayer).blockRefund(0))
                .to.be.revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert block refund if it is already refunded and refunder is user.", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            await expect(bridge.connect(relayer).blockRefund(0))
                .to.be.revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(0);
        });

        it("Should revert block refund if is already blocked even if the relayer calls.", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await bridge.connect(relayer).blockRefund(0);
            await expect(bridge.connect(relayer).blockRefund(0))
                .to.be.revertedWithCustomError(bridge, "RefundIsBlocked")
                .withArgs(0);
        });

        it("Should revert refund if it is already refunded", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await bridge.connect(user).refund(0);
            await expect(bridge.connect(user).refund(0))
                .to.be.revertedWithCustomError(bridge, "NonceIsRefunded")
                .withArgs(0);
        });

        it("Should revert if time before refund is not reached", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await expect(bridge.connect(user).refund(0)).to.be.revertedWithCustomError(
                bridge,
                "MinTimeToRefundIsNotReached"
            );
        });

        it("Should revert caller is not an admin, creator or relayer", async () => {
            await bridge.connect(user2).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await ethers.provider.send("evm_increaseTime", [300]);
            await ethers.provider.send("evm_mine", []);
            await expect(bridge.connect(user).refund(0))
                .to.be.revertedWithCustomError(bridge, "OnlyRelayerOrCreatorCanRefund")
                .withArgs(0);
        });

        it("Should revert blockRefund if caller is not a relayer", async () => {
            await bridge.connect(user).send(mockNative, user.address, ethers.parseEther("1"), {
                value: ethers.parseEther("1")
            });
            await expect(bridge.connect(user).blockRefund(0)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.RELAYER_ROLE()).toLocaleLowerCase()
            );
        });

        it("Should be possible to add same wrapped native twice", async () => {
            let wrappedNative = await bridge.wrappedNative();
            await bridge.connect(deployer).setNewWrappedNative(wrappedNative);
            await bridge.connect(deployer).setNewWrappedNative(wrappedNative);
            expect(await bridge.tokenIsSupported(wrappedNative)).to.be.true;
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
                bridge.connect(user).addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"))
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(bridge.connect(user).upgradeTo(mockERC20)).to.be.revertedWith(
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

            await expect(
                bridge.connect(user).setMinAmountForToken(mockERC20, ethers.parseEther("0.1"))
            ).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );

            await expect(
                bridge.connect(user).setOtherChainToken(mockERC20, tokenOnSecondChain.address)
            ).to.be.revertedWith(
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
            await expect(
                bridge
                    .connect(user)
                    .initialize(
                        2,
                        mockNative,
                        ethers.parseEther("0.1"),
                        tokenOnSecondChain.address,
                        relayer.address,
                        FIVE_MINUTES
                    )
            ).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should be able to upgrade contract from owner", async () => {
            const Bridge = await ethers.getContractFactory("Bridge", deployer);
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
            await bridge.setMinAmountForToken(mockNative, ethers.parseEther("0.2"));
            expect(await bridge.minAmountForToken(mockNative)).to.be.equal(ethers.parseEther("0.2"));
        });

        it("Should set new token on second chain", async () => {
            await bridge.setOtherChainToken(mockNative, relayer.address);
            expect(await bridge.otherChainToken(mockNative)).to.be.equal(relayer.address);
        });
    });

    describe("# Removed token", function () {
        it("Should remove token", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            const whitelistSize = await bridge.allWhitelistedTokensLength();
            await bridge.removeToken(mockERC20);
            expect(await bridge.tokenIsSupported(mockERC20)).to.be.false;
            expect(await bridge.allWhitelistedTokensLength()).to.be.equal(whitelistSize - 1n);
            const whitelist = await bridge.getAllWhitelistedTokens();
            expect(whitelist).to.not.include(mockERC20);
        });

        it("Should not send removed token", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await bridge.removeToken(mockERC20);
            await expect(bridge.send(mockERC20, user.address, ethers.parseEther("0.1")))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20);
        });

        it("Should still refund send even if tokens is not already supported", async () => {
            await bridge.addToken(mockERC20, tokenOnSecondChain.address, ethers.parseEther("0.1"));
            await mockERC20.mintFor(user.address, ethers.parseEther("1"));
            await mockERC20.connect(user).approve(bridge, ethers.parseEther("1"));
            await bridge.connect(user).send(mockERC20, user.address, ethers.parseEther("1"));
            await bridge.removeToken(mockERC20);
            // wait min time before refund
            await time.increase(time.duration.minutes(5));
            await expect(bridge.connect(user).refund((await bridge.nonce()) - 1n)).to.not.be.reverted;
        });

        it("Should revert removing not supported token", async () => {
            await expect(bridge.removeToken(mockERC20))
                .to.be.revertedWithCustomError(bridge, "TokenIsNotSupported")
                .withArgs(mockERC20);
        });

        it("Should revert removing token by non admin caller", async () => {
            await expect(bridge.connect(user).removeToken(mockERC20)).to.be.revertedWith(
                "AccessControl: account" +
                    " " +
                    user.address.toLocaleLowerCase() +
                    " is missing role " +
                    (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
            );
        });
    });

    it("Should set new wrapped native", async () => {
        const MockERC20 = await ethers.getContractFactory("MockToken", deployer);
        const newMockERC20 = await MockERC20.deploy("MockERC20", "ERC20", 18);
        await bridge.setNewWrappedNative(newMockERC20);
        expect(await bridge.wrappedNative()).to.be.equal(newMockERC20);
    });

    it("Should revert set new wrapped native from non admin caller", async () => {
        await expect(bridge.connect(user).setNewWrappedNative(mockNative)).to.be.revertedWith(
            "AccessControl: account" +
                " " +
                user.address.toLocaleLowerCase() +
                " is missing role " +
                (await bridge.DEFAULT_ADMIN_ROLE()).toLocaleLowerCase()
        );
    });
});
