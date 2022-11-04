// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

library CastUint {
    /**
     * @dev Strips and converts a `uint256` to `address`
     */
    function toAddress(uint256 value) internal pure returns (address) {
        if (value == 0) return address(0);
        return address(uint160(value));
    }
}
