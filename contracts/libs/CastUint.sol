//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

library CastUint {
    /**
     * @dev Converts a `uint256` to `address`
     */
    function toAddress(uint256 value) internal pure returns (address) {
        bytes memory data = new bytes(32);
        assembly {
            mstore(add(data, 32), value)
        }
        return abi.decode(data, (address));
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` decimal representation.
     */
    function toString(uint256 value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT licence
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
