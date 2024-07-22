// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title MAG Token (MAG).
 * @notice This contract is the ERC20 token.
 *
 * This contract includes the basic ERC20 functionality.
 * Smart contract is NOT upgredeable.
 * The one who deploys the contract becomes its administrator.
 * The one who deploys the contract becomes its pauser.
 */
contract MAGToken is ERC20Permit, AccessControl {
    /**
     * @notice Initializes contract by setting token name(MAG Token) and token symbol(MAG),
     * transfers total supply to person who deployed smart contract.
     * Person that deployed smart contract becom administrator.
     * Person that deployed smart contract becom pauser.
     *
     *
     * Requeirements:
     *  - `msg.sender` should not be zero addresss.
     */
    constructor(uint256 _totalSupply) ERC20("MAG Token", "MAG") ERC20Permit("MAG Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _mint(msg.sender, _totalSupply);
    }
}
