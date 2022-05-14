//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../vaults/BaseVault.sol";
import "./YieldSourceMock.sol";

contract YieldVaultMock is BaseVault {
    YieldSourceMock public pool;

    constructor(
        string memory name,
        string memory symbol,
        address _asset,
        address _strategist,
        address _pool
    ) BaseVault(name, symbol, _asset, _strategist) {
        pool = YieldSourceMock(_pool);
    }

    function totalAssets() public override view returns(uint) {
        return pool.convertToAssets(pool.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        pool.withdraw(assets);
    }

    function _afterRoundStart(uint assets) internal override {
        if (pool.previewDeposit(assets) > 0) {
            pool.asset().approve(address(pool), assets);
            pool.deposit(assets, address(this));
        }
    }
}
