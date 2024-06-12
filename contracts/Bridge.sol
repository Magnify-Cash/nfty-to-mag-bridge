// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

error AmountIsLessThanMinimum(uint256 amount, uint256 minAmount);
error AmountIsNotEqualToMsgValue(uint256 amount, uint256 msgValue);
error NonceIsUsed(uint256 nonce);
error NonceIsRefunded(uint256 nonce);
error TokenIsNotSupported(address token);
error RefundIsBlocked(uint256 nonce);
error MinTimeToRefundIsNotReached(uint256 minTimeToRefund, uint256 creationTime); 
error OnlyRelayerOrCreatorCanRefund(uint256 nonce);
error MsgValueShouldBeZero();
error FailedToSendEther();
error MinTimeToWaitBeforeRefundIsTooBig(uint256 minTimeToWaitBeforeRefund);

contract Bridge is UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    struct NonceInfo{
        address token;
        address creator;
        address to;
        uint256 amount;
        uint256 creationTime;
    }
    /// @notice Role required to withdraw and refund tokens from the bridge
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Chain ID of the second chain
    uint24 public secondChainId;
    /// @notice Minimum time to wait before refunding a transaction
    uint256 public minTimeToWaitBeforeRefund;
    /// @notice Address of the wrapped native token
    address public wrappedNative;

    /// @notice Mapping of supported tokens (token => isSupported)
    mapping(address => bool) public tokenIsSupported;
    /// @notice Mapping of all added addresses in whitelist 
    address[] public allWhitelistedTokens;
    /// @notice Mapping of minimum amount for tokens (token => minAmount)
    mapping(address => uint256) public minAmountForToken;
    /// @notice Mapping of other chain tokens (token => otherChainToken)
    mapping(address => address) public otherChainToken;
    /// @notice Unique nonce for each send transaction
    uint256 public nonce;
    /// @notice Mapping of used nonces (nonce => isUsed)
    mapping(uint256 => bool) public nonceIsUsed;
    /// @notice Mapping of nonce info (nonce => NonceInfo)
    mapping (uint256 => NonceInfo) public nonceInfo;
    /// @notice Mapping of blocked nonces for refund (nonce => isBlocked)
    mapping (uint256 => bool) public nonceIsBlockedForRefund;
    /// @notice Mapping of used nonces for refund (nonce => isRefunded)
    mapping (uint256 => bool) public nonceIsRefunded;

    event Refund(address indexed token, address indexed to, uint256 amount, uint256 nonce);
    event BlockRefund(uint256 nonce);
    event Send(address indexed token, address indexed tokenOnSecondChain, address indexed to, uint256 amount, uint256 nonce);
    event Withdraw(address indexed token, address indexed tokenOnSecondChain, address indexed to, uint256 amount, uint256 nonce);
    event AddToken(address indexed token, address indexed tokenOnSecondChain, uint256 minAmount);
    event RemoveToken(address indexed token);
    event NewWrappedNative(address indexed oldWrappedNative, address indexed newWrappedNative);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
    event NewMinTimeToWaitBeforeRefund(uint256 indexed minTimeToWaitBeforeRefund);
    event NewMinAmountForToken(address indexed token, uint256 indexed minAmount);
    event NewOtherChainToken(address indexed token, address indexed otherChainToken);

    /// @notice Modifier to check if the token is supported
    /// @param token Address of the token
    modifier onlySupportedToken(address token) {
        if (!tokenIsSupported[token]) {
            revert TokenIsNotSupported(token);
        }
        _;
    }

    receive() external payable {}

    /// @notice function to initialize the contract
    /// @param _secondChainId Chain ID of the second chain
    /// @param _wrappedNative Address of the wrapped native token
    /// @param _minAmountForNative Minimum amount for the wrapped native token
    /// @param _otherChainTokenForNative Address on the other chain of the token for the wrapped native token
    /// @param _relayer Address of the relayer
    /// @param _minTimeToWaitBeforeRefund Minimum time to wait before refunding a transaction
    function initialize(
        uint24 _secondChainId,
        address _wrappedNative,
        uint256 _minAmountForNative,
        address _otherChainTokenForNative,
        address _relayer,
        uint256 _minTimeToWaitBeforeRefund
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RELAYER_ROLE, _relayer);
        wrappedNative = _wrappedNative;
        addToken(_wrappedNative, _otherChainTokenForNative, _minAmountForNative);
        secondChainId = _secondChainId;
        minTimeToWaitBeforeRefund = _minTimeToWaitBeforeRefund;
    }

    /// @notice function to send tokens to the second chain
    /// @dev the function can be called only for a supported token and only emits a specific event for the backend to listen to
    /// @param token Address of the token
    /// @param to Address of the receiver on the second chain
    /// @param amount Amount of tokens to send 
    function send(
        address token,
        address to,
        uint256 amount
    ) external payable whenNotPaused onlySupportedToken(token) {
        if(amount >= minAmountForToken[token]) {
            if(token == wrappedNative) {
                if(msg.value == amount){
                    nonceInfo[nonce] = NonceInfo(token, msg.sender, to, amount, block.timestamp);
                    emit Send(token, otherChainToken[token], to, amount, nonce++);
                    }
                else
                    revert AmountIsNotEqualToMsgValue(amount, msg.value);
            } else {
                if(msg.value > 0)
                    revert MsgValueShouldBeZero();
                IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
                nonceInfo[nonce] = NonceInfo(token, msg.sender, to, amount, block.timestamp);
                emit Send(token, otherChainToken[token], to, amount, nonce++);
            }
        } else {
            revert AmountIsLessThanMinimum(amount, minAmountForToken[token]);
        }
    }

    /// @notice function to block a nonce for refund
    /// @dev the function can be called only by a relayer and should be called before withdrawing on the second chain
    /// @param nonceToBlock Nonce to block
    function blockRefund(uint256 nonceToBlock) external onlyRole(RELAYER_ROLE) {
        if (nonceIsBlockedForRefund[nonceToBlock])
            revert RefundIsBlocked(nonceToBlock);
        if (nonceIsRefunded[nonceToBlock])
            revert NonceIsRefunded(nonceToBlock);
        nonceIsBlockedForRefund[nonceToBlock] = true;
        emit BlockRefund(nonceToBlock);
    }

    /// @notice function to refund a sending transaction
    /// @dev the function can be called only by a relayer, admin or the creator of the transaction
    /// @param nonceToRefund Nonce of the transaction to refund
    function refund(uint256 nonceToRefund) external {
        NonceInfo memory nonceInfoToRefund = nonceInfo[nonceToRefund];
        /// Anyone can refund if this nonce already refunded.
        if (nonceIsRefunded[nonceToRefund]) {
            revert NonceIsRefunded(nonceToRefund);
        }
        /// msg.sender == user.
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(RELAYER_ROLE, msg.sender)) {
            if (nonceIsBlockedForRefund[nonceToRefund]) {
                revert RefundIsBlocked(nonceToRefund);
            }
            nonceIsRefunded[nonceToRefund] = true;
            if (block.timestamp <= nonceInfoToRefund.creationTime + minTimeToWaitBeforeRefund)
                revert MinTimeToRefundIsNotReached(
                    nonceInfoToRefund.creationTime + minTimeToWaitBeforeRefund,
                    block.timestamp
                );

            if (msg.sender != nonceInfoToRefund.creator && !hasRole(RELAYER_ROLE, msg.sender)){
                revert OnlyRelayerOrCreatorCanRefund(nonceToRefund);
            }
        }
        /// msg.sender == Admin or msg.sender == Relayer.
        else if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(RELAYER_ROLE, msg.sender)) {
            nonceIsRefunded[nonceToRefund] = true;
        }
        /// Refund functionality.
        if (nonceInfoToRefund.token == wrappedNative){
            (bool sent, ) = payable(nonceInfoToRefund.creator).call{value: nonceInfoToRefund.amount}("");
            if (!sent)
                revert FailedToSendEther();
        }
        else
            IERC20Upgradeable(nonceInfoToRefund.token).safeTransfer(
                nonceInfoToRefund.creator, nonceInfoToRefund.amount);

        emit Refund(
            nonceInfoToRefund.token, 
            nonceInfoToRefund.to, 
            nonceInfoToRefund.amount, 
            nonceToRefund
        );
    }

    /// @notice function to withdraw tokens from the second chain
    /// @dev the function can be called only by a relayer and should be called after blocking the nonce for refund
    /// @param token Address of the token
    /// @param to Address of the receiver on the second chain
    /// @param amount Amount of tokens to withdraw
    /// @param nonceOnOtherChain Nonce of the transaction on the first chain
    function withdraw(
        address token,
        address to,
        uint256 amount,
        uint256 nonceOnOtherChain
    ) external whenNotPaused onlyRole(RELAYER_ROLE) onlySupportedToken(token) {
        if(!nonceIsUsed[nonceOnOtherChain]) {
            nonceIsUsed[nonceOnOtherChain] = true;
            emit Withdraw(token, otherChainToken[token], to, amount, nonceOnOtherChain);
            if(token == wrappedNative) {
                (bool sent,) = payable(to).call{value: amount}("");
                if(!sent)
                    revert FailedToSendEther();
            } else {
                IERC20Upgradeable(token).safeTransfer(to, amount);
            }
        } else {
            revert NonceIsUsed(nonceOnOtherChain);
        }
    }

    /// @notice function to withdraw tokens from the bridge contract
    /// @dev can be called only in the paused state by the admin
    /// @param token Address of the token
    /// @param to Address of the receiver
    /// @param amount Amount of tokens to withdraw
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        if(token == wrappedNative){
            (bool sent,) = payable(to).call{value: amount}("");
            if(!sent)
                revert FailedToSendEther();
        }
        else
            IERC20Upgradeable(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /// @notice function to add a new token to the bridge
    /// @param token Address of the token
    /// @param tokenOnSecondChain Address of the token on the second chain
    /// @param minAmount Minimum amount of tokens to send
    function addToken(
        address token,
        address tokenOnSecondChain,
        uint256 minAmount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        tokenIsSupported[token] = true;
        allWhitelistedTokens.push(token);
        minAmountForToken[token] = minAmount;
        otherChainToken[token] = tokenOnSecondChain;
        emit AddToken(token, tokenOnSecondChain, minAmount); 
    }

    /// @notice function to remove a token from the bridge
    /// @param token Address of the token
    function removeToken(address token) public 
    onlyRole(DEFAULT_ADMIN_ROLE) onlySupportedToken(token){
        tokenIsSupported[token] = false;
        for (uint256 i = 0; i < allWhitelistedTokens.length; i++) {
            if (allWhitelistedTokens[i] == token) {
                allWhitelistedTokens[i] = allWhitelistedTokens[allWhitelistedTokens.length - 1];
                allWhitelistedTokens.pop();
                break;
            }
        }
        emit RemoveToken(token);
    }

    /// @notice function to set the minimum amount of tokens to send
    /// @param token Address of the token
    /// @param minAmount Minimum amount of tokens to send
    function setMinAmountForToken(address token, uint256 minAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minAmountForToken[token] = minAmount;
        emit NewMinAmountForToken(token, minAmount);
    }

    /// @notice function to set the address of the token on the second chain
    /// @param token Address of the token
    /// @param tokenOnSecondChain Address of the token on the second chain
    function setOtherChainToken(address token, address tokenOnSecondChain) external onlyRole(DEFAULT_ADMIN_ROLE) {
        otherChainToken[token] = tokenOnSecondChain;
        emit NewOtherChainToken(token, tokenOnSecondChain);
    }

    /// @notice function to set the minimum time to wait before refunding a transaction
    /// @param _minTimeToWaitBeforeRefund Minimum time to wait before refunding a transaction
    function setTimeToWaitBeforeRefund(uint256 _minTimeToWaitBeforeRefund) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_minTimeToWaitBeforeRefund > 1 hours) {
            revert MinTimeToWaitBeforeRefundIsTooBig(_minTimeToWaitBeforeRefund);
        }
        minTimeToWaitBeforeRefund = _minTimeToWaitBeforeRefund;
        emit NewMinTimeToWaitBeforeRefund(_minTimeToWaitBeforeRefund);
    } 

    /// @notice function to pause the bridge
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice function to unpause the bridge
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice function to set the address of the wrapped native token
    /// @param _wrappedNative Address of the wrapped native token
    function setNewWrappedNative(address _wrappedNative) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address _oldOtherChainWrappedNative = otherChainToken[wrappedNative];
        uint256 _oldMinAmountForWrappedNative = minAmountForToken[wrappedNative];
        removeToken(wrappedNative);
        addToken(
            _wrappedNative, 
            _oldOtherChainWrappedNative, 
            _oldMinAmountForWrappedNative
        );
        emit NewWrappedNative(wrappedNative, _wrappedNative);
        wrappedNative = _wrappedNative;
    }

    /// @notice function to get the length of all whitelisted tokens
    /// @return Length of all whitelisted tokens
    function allWhitelistedTokensLength() external view returns(uint256) {
        return allWhitelistedTokens.length;
    }

    /// @notice function to get all whitelisted tokens
    /// @return Array of all whitelisted tokens
    function getAllWhitelistedTokens() external view returns(address[] memory) {
        return allWhitelistedTokens;
    } 

    /// @notice function to ensure that only admin can upgrade the contract
    /// @param newImplementation Address of the new implementation 
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

