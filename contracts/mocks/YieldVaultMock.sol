//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../vaults/BaseVault.sol";
import "./YieldSourceMock.sol";

contract YieldVaultMock is BaseVault {
    YieldSourceMock public yieldSource;

    constructor(
        string memory name,
        string memory symbol,
        address _asset,
        address _strategist,
        address _yieldSource
    ) BaseVault(name, symbol, _asset, _strategist) {
        yieldSource = YieldSourceMock(_yieldSource);
    }

    function totalAssets() public override view returns(uint256) {
        return yieldSource.convertToAssets(yieldSource.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        yieldSource.withdraw(assets);
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (yieldSource.previewDeposit(assets) > 0) {
            yieldSource.asset().approve(address(yieldSource), assets);
            yieldSource.deposit(assets, address(this));
        }
    }
}
