//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../libs/DepositQueueLib.sol";


contract DepositQueueMock {
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    DepositQueueLib.DepositQueue private depositQueue;

    function push(uint amount) external {
        depositQueue.push(DepositQueueLib.DepositEntry(msg.sender, amount));
    }

    function remove(uint startIndex, uint endIndex) external {
        depositQueue.remove(startIndex, endIndex);
    }

    function get(uint index) external view returns(DepositQueueLib.DepositEntry memory) {
        return depositQueue.get(index);
    }

    function balanceOf(address owner) external view returns(uint) {
        return depositQueue.balanceOf(owner);
    }

    function size() external view returns(uint) {
        return depositQueue.size();
    }
}
