// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AddressUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract NFTYMigrator is UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // _______________ Libraries _______________

    /*
     * Adding the methods from the OpenZeppelin's library which wraps around ERC20 operations that
     * throw on failure to implement their safety.
     */
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // _______________ Constants _______________

    uint256 public constant DIVIDER = 8;

    // _______________ Storage _______________

    /// @notice Mapping of supported tokens (token => isSupported)
    mapping(address => bool) public tokenIsSupported;

    /// @notice MAG token
    IERC20Upgradeable public mag;

    /// @notice Mapping of all added addresses in whitelist
    address[] public allWhitelistedTokens;

    /// @notice Mapping of minimum amount for tokens (token => minAmount)
    mapping(address => uint256) public minAmountForToken;

    // _______________ Events _______________

    event AddToken(address indexed token, uint256 minAmount);

    event Send(address indexed token, address indexed to, uint256 amount, uint256 amountToReceive);

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    event NewMinAmountForToken(address indexed token, uint256 indexed minAmount);

    event RemoveToken(address indexed token);

    // _______________ Errors _______________

    error TokenIsNotSupported(address token);

    error ZeroAddress();

    error AmountIsLessThanMinimum(uint256 amount, uint256 minAmount);

    // _______________ Modifiers _______________

    /// @notice Modifier to check if the token is supported
    /// @param token Address of the token
    modifier onlySupportedToken(address token) {
        if (!tokenIsSupported[token]) {
            revert TokenIsNotSupported(token);
        }
        _;
    }

    receive() external payable {}

    // _______________ Initializer _______________

    function initialize() public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // _______________ External functions _______________

    /// @notice function to send NFTY tokens and convert them to MAG
    /// @dev the function can be called only for a supported token
    /// @param token Address of the token
    /// @param to Address of the receiver on the second chain
    /// @param amount Amount of tokens to send
    function send(address token, address to, uint256 amount) external whenNotPaused onlySupportedToken(token) {
        if (to == address(0)) revert ZeroAddress();
        if (amount < minAmountForToken[token]) revert AmountIsLessThanMinimum(amount, minAmountForToken[token]);

        uint256 amountToReceive = _convertNFTYtoMAG(amount);

        emit Send(token, to, amount, amountToReceive);

        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20Upgradeable(mag).safeTransfer(to, amountToReceive);
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
    /// @param minAmount Minimum amount of tokens to send
    function addToken(address token, uint256 minAmount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        tokenIsSupported[token] = true;
        allWhitelistedTokens.push(token);
        minAmountForToken[token] = minAmount;
        emit AddToken(token, minAmount);
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

    /// @notice function to pause the bridge
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice function to unpause the bridge
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice function to set the minimum amount of tokens to send
    /// @param token Address of the token
    /// @param minAmount Minimum amount of tokens to send
    function setMinAmountForToken(address token, uint256 minAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minAmountForToken[token] = minAmount;
        emit NewMinAmountForToken(token, minAmount);
    }

    /// @notice function to set the MAG token
    /// @param _magToken Address of the MAG token
    function setMagToken(IERC20Upgradeable _magToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(_magToken) == address(0)) revert ZeroAddress();
        mag = _magToken;
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

    /// @notice function to convert NFTY to MAG
    /// @return Amount of NFTY tokens to receive
    function getConvertedAmount(uint256 amount) external pure returns (uint256) {
        return _convertNFTYtoMAG(amount);
    }

    /// @notice function to convert NFTY to MAG
    /// @return Amount of MAG tokens to receive
    function _convertNFTYtoMAG(uint256 amount) internal pure returns (uint256) {
        return amount / DIVIDER;
    }

    /// @notice function to ensure that only admin can upgrade the contract
    /// @param newImplementation Address of the new implementation
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
