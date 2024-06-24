// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "../NFTYBridge.sol";

error TransferError();

contract MockReceiver {
    receive() external payable {
        revert("MockReceiver: revert");
    }

    function sendNativeToBridge(address payable bridge) external payable {
        (bool sent, ) = payable(bridge).call{value: msg.value}("");
        if (!sent) revert TransferError();
    }
}
