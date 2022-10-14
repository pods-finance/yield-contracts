// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "../vaults/BaseVault.sol";
import "./YieldSourceMock.sol";

contract YieldVaultMock is BaseVault {
    YieldSourceMock public yieldSource;

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _yieldSource
    ) BaseVault(_configuration, _asset) {
        yieldSource = YieldSourceMock(_yieldSource);
    }

    function assetsOf(address owner) public view override returns (uint256) {
        uint256 shares = balanceOf(owner);
        return convertToAssets(shares) + idleAssetsOf(owner);
    }

    function totalAssets() public view override returns (uint256) {
        return yieldSource.convertToAssets(yieldSource.balanceOf(address(this))) + processedDeposits;
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        yieldSource.withdraw(assets, address(this), address(this));
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (yieldSource.previewDeposit(assets) > 0) {
            IERC20Metadata(yieldSource.asset()).approve(address(yieldSource), assets);
            yieldSource.deposit(assets, address(this));
        }
    }
}
