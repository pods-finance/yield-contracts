// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.6;

import "../libs/FixedPointMath.sol";
import "./Asset.sol";

contract InvestorActorMock {
    using FixedPointMath for uint256;
    Asset public immutable asset;

    constructor(address _asset) {
        asset = Asset(_asset);
    }

    function generatePremium(uint256 amount) external {
        asset.mint(amount);
    }

    function buyOptionsWithYield() external {
        uint256 ownBalance = asset.balanceOf(address(this));
        asset.burn(ownBalance);
    }

    function approveVaultToPull(address vaultAddress) external {
        asset.approve(vaultAddress, type(uint256).max);
    }
}
