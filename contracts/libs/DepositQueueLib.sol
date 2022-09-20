// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

library DepositQueueLib {
    struct DepositEntry {
        address owner;
        uint256 amount;
    }

    struct DepositQueue {
        address[] list;
        mapping(address => uint256) cache;
        uint256 totalDeposited;
    }

    function push(DepositQueue storage queue, DepositEntry memory deposit) internal {
        if (queue.cache[deposit.owner] == 0 && deposit.amount > 0) {
            queue.list.push(deposit.owner);
        }

        queue.cache[deposit.owner] += deposit.amount;
        queue.totalDeposited += deposit.amount;
    }

    function remove(
        DepositQueue storage queue,
        uint256 startIndex,
        uint256 endIndex
    ) internal {
        if (endIndex > startIndex) {
            address[] memory newList = new address[](queue.list.length - (endIndex - startIndex));
            uint256 i = 0;

            // Copying the skipped interval to the new array
            while (i < startIndex) {
                newList[i] = queue.list[i];
                i++;
            }

            // Remove the interval from the cache
            while (startIndex < endIndex) {
                // No need to check, it can't go below 0
                unchecked {
                    queue.totalDeposited -= queue.cache[queue.list[startIndex]];
                }
                queue.cache[queue.list[startIndex]] = 0;
                startIndex++;
            }

            // Copying the rest of the list with the remaining entries
            while (endIndex < queue.list.length) {
                newList[i++] = queue.list[endIndex++];
            }

            queue.list = newList;
        }
    }

    function get(DepositQueue storage queue, uint256 index) internal view returns (DepositEntry memory depositEntry) {
        if (index < queue.list.length) {
            address owner = queue.list[index];
            depositEntry.owner = owner;
            depositEntry.amount = queue.cache[owner];
        }
    }

    function balanceOf(DepositQueue storage queue, address owner) internal view returns (uint256) {
        return queue.cache[owner];
    }

    function size(DepositQueue storage queue) internal view returns (uint256) {
        return queue.list.length;
    }
}
