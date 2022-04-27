//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../libs/FixedPointMath.sol";
import "./Underlying.sol";

contract InvestorActorMock {
    using FixedPointMath for uint256;
    Underlying public immutable underlying;

    constructor(address _underlying) {
        underlying = Underlying(_underlying);
    }

    function generatePremium(uint256 amount) external {
        underlying.mint(amount);
    }

    function buyOptionsWithYield() external {
        uint256 ownBalance = underlying.balanceOf(address(this));
        underlying.burn(ownBalance);
    }

    function approveVaultToPull(address vaultAddress, uint256 amount) external {
        underlying.approve(vaultAddress, amount);
    }
}
