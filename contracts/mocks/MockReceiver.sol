// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../Bridge.sol";

contract MockReceiver{
    receive() external payable{
        revert("MockReceiver: revert");
    }

    function sendNativeToBridge(
        address payable bridge,
        address token
    ) external payable {
        Bridge(bridge).send{value: msg.value}(
            token,
            address(this),
            msg.value
        );
    }
}