//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../libs/DepositQueueLib.sol";


contract DepositQueueMock {
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    DepositQueueLib.DepositQueue private depositQueue;

    function push(uint256 amount) external {
        depositQueue.push(DepositQueueLib.DepositEntry(msg.sender, amount));
    }

    function remove(uint256 startIndex, uint256 endIndex) external {
        depositQueue.remove(startIndex, endIndex);
    }

    function get(uint256 index) external view returns(DepositQueueLib.DepositEntry memory) {
        return depositQueue.get(index);
    }

    function balanceOf(address owner) external view returns(uint256) {
        return depositQueue.balanceOf(owner);
    }

    function size() external view returns(uint256) {
        return depositQueue.size();
    }
}
