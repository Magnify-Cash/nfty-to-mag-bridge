// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "@openzeppelin/contracts/utils/Strings.sol";

contract NFTYBridge is UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // _______________ Libraries _______________

    /*
     * Adding the methods from the OpenZeppelin's library which wraps around ERC20 operations that
     * throw on failure to implement their safety.
     */
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // _______________ Structures _______________

    /**
     * @notice Nonce info structure
     *
     * token - Addresses of sent token
     * creater - Address of nonce creator
     * to - Address to send tokens on the other chain
     * amount - Amount of tokens
     * creationTime - Timestamp of created nonce
     */
    struct NonceInfo {
        address token;
        address creator;
        address to;
        uint256 amount;
        uint256 creationTime;
    }

    // _______________ Constants _______________

    /// @notice Role required to withdraw and refund tokens from the bridge
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint256 public constant DIVIDER = 8;

    // _______________ Storage _______________

    /// @notice Chain ID of the second chain
    uint24 public secondChainId;

    /// @notice Minimum time to wait before refunding a transaction
    uint256 public minTimeToWaitBeforeRefund;

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

    /// @notice Name of the chain
    string public chain;

    /// @notice Mapping of nonce info (nonce => NonceInfo)
    mapping(uint256 => NonceInfo) public nonceInfo;

    /// @notice Mapping of blocked nonces for refund (nonce => isBlocked)
    mapping(uint256 => bool) public nonceIsBlockedForRefund;

    /// @notice Mapping of used nonces for refund (nonce => isRefunded)
    mapping(uint256 => bool) public nonceIsRefunded;

    /// @notice Mapping of allocations of the address (address => allocations)
    mapping(address => uint256) public allocations;

    /// @notice Mapping of which addresses are whitelisted (address => isWhitelisted)
    mapping(address => bool) public isWhitelisted;

    // _______________ Events _______________

    event Refund(address indexed token, address indexed to, uint256 amount, uint256 nonce);

    event BlockRefund(uint256 nonce);

    event Send(
        address indexed token,
        address indexed tokenOnSecondChain,
        address indexed to,
        uint256 amount,
        uint256 amountToReceive,
        string nonce
    );

    event AddToken(address indexed token, address indexed tokenOnSecondChain, uint256 minAmount);

    event RemoveToken(address indexed token);

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    event NewMinTimeToWaitBeforeRefund(uint256 indexed minTimeToWaitBeforeRefund);

    event NewMinAmountForToken(address indexed token, uint256 indexed minAmount);

    event NewOtherChainToken(address indexed token, address indexed otherChainToken);

    // _______________ Errors _______________

    error AmountIsLessThanMinimum(uint256 amount, uint256 minAmount);

    error NonceIsRefunded(uint256 nonce);

    error TokenIsNotSupported(address token);

    error RefundIsBlocked(uint256 nonce);

    error MinTimeToRefundIsNotReached(uint256 minTimeToRefund, uint256 creationTime);

    error OnlyRelayerOrCreatorCanRefund(uint256 nonce);

    error MinTimeToWaitBeforeRefundIsTooBig(uint256 minTimeToWaitBeforeRefund);

    error InsufficientAmountToSend();

    error NotWhitelisted(address caller);

    error ZeroAmount();

    error LengthMismatch();

    error AllocationsAlreadySet(address user);

    error ZeroAddress();

    // _______________ Modifiers _______________

    /// @notice Modifier to check if the token is supported
    /// @param token Address of the token
    modifier onlySupportedToken(address token) {
        if (!tokenIsSupported[token]) {
            revert TokenIsNotSupported(token);
        }
        _;
    }

    modifier onlyWhitelisted(address caller, uint256 amount) {
        if (!isWhitelisted[caller]) {
            revert NotWhitelisted(caller);
        }

        if (amount > allocations[caller]) {
            revert InsufficientAmountToSend();
        }

        _;
    }

    receive() external payable {}

    // _______________ Initializer _______________

    /// @notice function to initialize the contract
    /// @param _secondChainId Chain ID of the second chain
    /// @param _relayer Address of the relayer
    /// @param _minTimeToWaitBeforeRefund Minimum time to wait before refunding a transaction
    function initialize(
        uint24 _secondChainId,
        address _relayer,
        uint256 _minTimeToWaitBeforeRefund,
        string calldata _chain
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RELAYER_ROLE, _relayer);
        secondChainId = _secondChainId;
        minTimeToWaitBeforeRefund = _minTimeToWaitBeforeRefund;
        chain = _chain;
    }

    // _______________ External functions _______________

    /// @notice function to send tokens to the second chain
    /// @dev the function can be called only for a supported token and only emits a specific event for the backend to listen to
    /// @param token Address of the token
    /// @param to Address of the receiver on the second chain
    /// @param amount Amount of tokens to send
    function send(
        address token,
        address to,
        uint256 amount
    ) external whenNotPaused onlyWhitelisted(msg.sender, amount) onlySupportedToken(token) {
        if (to == address(0)) revert ZeroAddress();

        if (amount >= minAmountForToken[token]) {
            allocations[msg.sender] -= amount;
            if (allocations[msg.sender] == 0) {
                isWhitelisted[msg.sender] = false;
            }

            uint256 amountToReceive = _convertNFTYtoMAG(amount);

            nonceInfo[nonce] = NonceInfo(token, msg.sender, to, amount, block.timestamp);
            nonce++;

            emit Send(token, otherChainToken[token], to, amount, amountToReceive, _getChainNonce());

            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        } else {
            revert AmountIsLessThanMinimum(amount, minAmountForToken[token]);
        }
    }

    /// @notice function to block a nonce for refund
    /// @dev the function can be called only by a relayer and should be called before withdrawing on the second chain
    /// @param nonceToBlock Nonce to block
    function blockRefund(uint256 nonceToBlock) external onlyRole(RELAYER_ROLE) {
        if (nonceIsBlockedForRefund[nonceToBlock]) revert RefundIsBlocked(nonceToBlock);
        if (nonceIsRefunded[nonceToBlock]) revert NonceIsRefunded(nonceToBlock);
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

            if (msg.sender != nonceInfoToRefund.creator && !hasRole(RELAYER_ROLE, msg.sender)) {
                revert OnlyRelayerOrCreatorCanRefund(nonceToRefund);
            }
        }
        /// msg.sender == Admin or msg.sender == Relayer.
        else if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(RELAYER_ROLE, msg.sender)) {
            nonceIsRefunded[nonceToRefund] = true;
        }

        /// Refund functionality.
        allocations[nonceInfoToRefund.creator] += nonceInfoToRefund.amount;
        if (isWhitelisted[nonceInfoToRefund.creator] == false) {
            isWhitelisted[nonceInfoToRefund.creator] = true;
        }

        emit Refund(nonceInfoToRefund.token, nonceInfoToRefund.to, nonceInfoToRefund.amount, nonceToRefund);

        IERC20Upgradeable(nonceInfoToRefund.token).safeTransfer(nonceInfoToRefund.creator, nonceInfoToRefund.amount);
    }

    /// @notice function to withdraw tokens from the bridge contract
    /// @dev can be called only in the paused state by the admin
    /// @param token Address of the token
    /// @param to Address of the receiver
    /// @param amount Amount of tokens to withdraw
    function emergencyWithdraw(
        address token,
        address payable to,
        uint256 amount
    ) external whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();

        if (token == address(0)) {
            uint256 balance = address(this).balance;
            AddressUpgradeable.sendValue(to, balance);
        } else IERC20Upgradeable(token).safeTransfer(to, amount);

        emit EmergencyWithdraw(token, to, amount);
    }

    // ____ Administrative functionality ___

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
    function removeToken(address token) public onlyRole(DEFAULT_ADMIN_ROLE) onlySupportedToken(token) {
        tokenIsSupported[token] = false;
        uint256 len = allWhitelistedTokens.length;
        for (uint256 i = 0; i < len; i++) {
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

    /// @notice function to add or remove addresses from the whitelist
    /// @param _accounts Addresses to add or remove from the whitelist
    /// @param _isWhitelisted Whether to add or remove the addresses from the whitelist
    function setWhitelisted(address[] calldata _accounts, bool _isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = _accounts.length;
        for (uint256 i = 0; i < len; i++) {
            isWhitelisted[_accounts[i]] = _isWhitelisted;
        }
    }

    /// @notice function to set the allocations
    /// @param _accounts Addresses to set the allocations for
    /// @param _allocations Allocations to set for the addresses by index
    function setAllocations(
        address[] calldata _accounts,
        uint256[] calldata _allocations
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = _accounts.length;

        if (len != _allocations.length) revert LengthMismatch();

        for (uint256 i = 0; i < len; i++) {
            if (isWhitelisted[_accounts[i]] == false) revert NotWhitelisted(_accounts[i]);

            allocations[_accounts[i]] = _allocations[i];
        }
    }

    /// @notice function to pause the bridge
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice function to unpause the bridge
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice function to get the length of all whitelisted tokens
    /// @return Length of all whitelisted tokens
    function allWhitelistedTokensLength() external view returns (uint256) {
        return allWhitelistedTokens.length;
    }

    /// @notice function to get all whitelisted tokens
    /// @return Array of all whitelisted tokens
    function getAllWhitelistedTokens() external view returns (address[] memory) {
        return allWhitelistedTokens;
    }

    /// @notice function to ensure that only admin can upgrade the contract
    /// @param newImplementation Address of the new implementation
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function _getChainNonce() internal view returns (string memory) {
        return string.concat(chain, Strings.toString(nonce));
    }

    function _convertNFTYtoMAG(uint256 amount) internal pure returns (uint256) {
        return amount / DIVIDER;
    }
}
