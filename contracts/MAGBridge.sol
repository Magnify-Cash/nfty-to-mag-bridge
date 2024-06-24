// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract MAGBridge is UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // _______________ Libraries _______________

    /*
     * Adding the methods from the OpenZeppelin's library which wraps around ERC20 operations that
     * throw on failure to implement their safety.
     */
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // _______________ Constants _______________

    /// @notice Role required to withdraw and refund tokens from the bridge
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // _______________ Storage _______________

    /// @notice Chain ID of the second chain
    uint24 public secondChainId;

    /// @notice Mapping of supported tokens (token => isSupported)
    mapping(address => bool) public tokenIsSupported;

    /// @notice Mapping of all added addresses in whitelist
    address[] public allWhitelistedTokens;

    /// @notice Mapping of minimum amount for tokens (token => minAmount)
    mapping(address => uint256) public minAmountForToken;

    /// @notice Mapping of other chain tokens (token => otherChainToken)
    mapping(address => address) public otherChainToken;

    /// @notice Mapping of used nonces (nonce => isUsed)
    mapping(string => bool) public nonceIsUsed;

    // _______________ Events _______________

    event Withdraw(
        address indexed token,
        address indexed tokenOnSecondChain,
        address indexed to,
        uint256 amount,
        string nonce
    );

    event AddToken(address indexed token, address indexed tokenOnSecondChain, uint256 minAmount);

    event RemoveToken(address indexed token);

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    event NewMinAmountForToken(address indexed token, uint256 indexed minAmount);

    event NewOtherChainToken(address indexed token, address indexed otherChainToken);

    // _______________ Errors _______________

    error NonceIsUsed(string nonce);

    error TokenIsNotSupported(address token);

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

    // _______________ Initializer _______________

    /// @notice function to initialize the contract
    /// @param _secondChainId Chain ID of the second chain
    /// @param _relayer Address of the relayer
    function initialize(uint24 _secondChainId, address _relayer) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RELAYER_ROLE, _relayer);
        secondChainId = _secondChainId;
    }

    // _______________ External functions _______________

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
        string calldata nonceOnOtherChain
    ) external whenNotPaused onlyRole(RELAYER_ROLE) onlySupportedToken(token) {
        if (to == address(0)) revert ZeroAddress();

        if (!nonceIsUsed[nonceOnOtherChain]) {
            nonceIsUsed[nonceOnOtherChain] = true;

            emit Withdraw(token, otherChainToken[token], to, amount, nonceOnOtherChain);

            IERC20Upgradeable(token).safeTransfer(to, amount);
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

    receive() external payable {}
}
