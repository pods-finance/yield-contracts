//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

library FixedPointMath {
    error FixedPointMath__DivByZero();
    using FixedPointMath for uint256;

    struct Fractional {
        uint256 numerator;
        uint256 denominator;
    }

    function mulDivDown(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (uint256 z) {
        if (denominator == 0) revert FixedPointMath__DivByZero();

        // solhint-disable-next-line no-inline-assembly
        assembly {
            // Store x * y in z for now.
            z := mul(x, y)

            // Equivalent to require(x == 0 || (x * y) / x == y)
            if iszero(or(iszero(x), eq(div(z, x), y))) {
                revert(0, 0)
            }

            // Divide z by the denominator.
            z := div(z, denominator)
        }
    }

    function mulDivUp(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (uint256 z) {
        if (denominator == 0) revert FixedPointMath__DivByZero();

        // solhint-disable-next-line no-inline-assembly
        assembly {
            // Store x * y in z for now.
            z := mul(x, y)

            // Equivalent to require(denominator != 0 && (x == 0 || (x * y) / x == y))
            if iszero(or(iszero(x), eq(div(z, x), y))) {
                revert(0, 0)
            }

            // First, divide z - 1 by the denominator and add 1.
            // We allow z - 1 to underflow if z is 0, because we multiply the
            // end result by 0 if z is zero, ensuring we return 0 if z is zero.
            z := mul(iszero(iszero(z)), add(div(sub(z, 1), denominator), 1))
        }
    }

    function mulDivUp(uint256 x, Fractional memory y) internal pure returns (uint256 z) {
        return x.mulDivUp(y.numerator, y.denominator);
    }

    function mulDivDown(uint256 x, Fractional memory y) internal pure returns (uint256 z) {
        return x.mulDivDown(y.numerator, y.denominator);
    }

    function mulDivUp(Fractional memory x, uint256 y) internal pure returns (uint256 z) {
        return x.numerator.mulDivUp(y, x.denominator);
    }

    function mulDivDown(Fractional memory x, uint256 y) internal pure returns (uint256 z) {
        return x.numerator.mulDivDown(y, x.denominator);
    }

    function fractionRoundUp(Fractional memory x) internal pure returns (uint256 z) {
        return x.numerator.mulDivUp(1, x.denominator);
    }

    function fractionRoundDown(Fractional memory x) internal pure returns (uint256 z) {
        return x.numerator.mulDivDown(1, x.denominator);
    }
}
