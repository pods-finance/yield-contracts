// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { Asset } from "./Asset.sol";

contract InvestorActorMock {
    Asset public immutable asset;

    constructor(address _asset) {
        asset = Asset(_asset);
    }

    function generatePremium(uint256 amount) external {
        asset.mint(amount);
    }

    function buyOptionsWithYield() external {
        uint256 ownBalance = asset.balanceOf(address(this));
        asset.transfer(address(0x1), ownBalance);
    }

    function approveVaultToPull(address vaultAddress) external {
        asset.approve(vaultAddress, type(uint256).max);
    }
}
