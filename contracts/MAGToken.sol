// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title MAG Token (MAG).
 * @notice This contract is the ERC20 token.
 *
 * This contract includes the basic ERC20 functionality.
 * Smart contract is NOT upgredeable.
 * The one who deploys the contract becomes its administrator.
 * The one who deploys the contract becomes its pauser.
 * Sets the BRIDGE_ROLE to bridge address.
 * The function _beforeTokenTransfer is overwritten in order to allow bridge to transfer tokens when the contract is paused.
 */
contract MAGToken is ERC20Permit, ERC20Pausable, AccessControl {
    /// @notice The role of person that able to stop all token transfers.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice The role of bridge that able to transfer tokens when the contract is paused.
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    /// @notice The address of the bridge.
    address public immutable bridge;

    /// Errors.
    error ZeroAddress();
    error OnlyBridgeCanTransfer();

    /**
     * @notice Initializes contract by setting token name(MAG Token) and token symbol(MAG),
     * transfers total supply to person who deployed smart contract.
     * Person that deployed smart contract becom administrator.
     * Person that deployed smart contract becom pauser.
     * Set BRIDGE_ROLE to bridge address.
     *
     *
     * Requeirements:
     *  - `msg.sender` should not be zero addresss.
     */
    constructor(uint256 _totalSupply, address _bridge) ERC20("MAG Token", "MAG") ERC20Permit("MAG Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        if (_bridge == address(0)) revert ZeroAddress();
        _grantRole(BRIDGE_ROLE, _bridge);
        bridge = _bridge;

        _mint(msg.sender, _totalSupply);
    }

    /**
     * @notice Pause all token transfers.
     *
     * Requirements:
     *  - The contract should be not paused.
     *  - Only caller with PAUSER_ROLE can puase.
     */
    function pause() public whenNotPaused onlyRole(PAUSER_ROLE) {
        super._pause();
    }

    /**
     * @notice Unpause all token transfers.
     *
     * Requirements:
     *  - The contract should be not paused.
     *  - Only caller with PAUSER_ROLE can unpause.
     */
    function unpause() public whenPaused onlyRole(PAUSER_ROLE) {
        super._unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        if (paused()) {
            if (hasRole(DEFAULT_ADMIN_ROLE, _msgSender()) || hasRole(BRIDGE_ROLE, _msgSender())) {
                _unpause();

                super._beforeTokenTransfer(from, to, amount);

                _pause();
            } else {
                revert OnlyBridgeCanTransfer();
            }
        }
        if (!paused()) {
            super._beforeTokenTransfer(from, to, amount);
        }
    }
}
