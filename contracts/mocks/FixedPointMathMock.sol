// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "../libs/AuxMath.sol";

contract AuxMathMock {
    using AuxMath for uint256;
    using AuxMath for AuxMath.Fractional;

    function mulDivUp(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) external pure returns (uint256) {
        return x.mulDivUp(y, denominator);
    }

    function mulDivDown(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) external pure returns (uint256) {
        return x.mulDivDown(y, denominator);
    }

    function mulDivUpFractional0(AuxMath.Fractional memory x, uint256 y) external pure returns (uint256) {
        return x.mulDivUp(y);
    }

    function mulDivDownFractional0(AuxMath.Fractional memory x, uint256 y) external pure returns (uint256) {
        return x.mulDivDown(y);
    }

    function mulDivUpFractional1(uint256 x, AuxMath.Fractional memory y) external pure returns (uint256) {
        return x.mulDivUp(y);
    }

    function mulDivDownFractional1(uint256 x, AuxMath.Fractional memory y) external pure returns (uint256) {
        return x.mulDivDown(y);
    }

    function fractionRoundUp(AuxMath.Fractional memory x) external pure returns (uint256) {
        return x.fractionRoundUp();
    }

    function fractionRoundDown(AuxMath.Fractional memory x) external pure returns (uint256) {
        return x.fractionRoundDown();
    }

    function min(uint256 x, uint256 y) external pure returns (uint256) {
        return AuxMath.min(x, y);
    }
}
