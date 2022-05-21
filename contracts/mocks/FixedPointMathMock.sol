//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../libs/FixedPointMath.sol";

contract FixedPointMathMock {
    using FixedPointMath for uint256;

    function mulDivDown(uint256 x, uint256 y, uint256 denominator) external pure returns(uint256) {
        return x.mulDivDown(y, denominator);
    }

    function mulDivUp(uint256 x, uint256 y, uint256 denominator) external pure returns(uint256) {
        return x.mulDivUp(y, denominator);
    }
}
