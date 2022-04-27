//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../vaults/BaseVault.sol";
import "./InterestPool.sol";

import "hardhat/console.sol";

contract InterestVaultMock is BaseVault {
    InterestPool public pool;

    constructor(address _underlying, address _strategist, address _pool) BaseVault(_underlying, _strategist) {
        pool = InterestPool(_pool);
    }

    function totalBalance() public view returns(uint) {
        return _totalBalance();
    }

    function _totalBalance() internal override view returns(uint) {
        return pool.convertToAssets(pool.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256, uint256 underlyingAmount) internal override {
        pool.withdraw(underlyingAmount);
    }

    function _afterRoundStart(uint underlyingAmount) internal override {
        if (pool.previewDeposit(underlyingAmount) > 0) {
            pool.underlying().approve(address(pool), underlyingAmount);
            pool.deposit(underlyingAmount, address(this));
        }
    }
}
