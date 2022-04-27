//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./BaseVault.sol";
import "../mocks/YieldSourceMock.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedETHBull is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;

    uint256 public constant DENOMINATOR = 10000;

    uint256 public lastRoundBalance;
    uint256 public investorRatio = 3000;
    address public investor;

    YieldSourceMock public pool;

    constructor(address _underlying, address _strategist, address _investor) BaseVault(_underlying, _strategist) {
        investor = _investor;
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external override pure returns(string memory) {
        return "Principal Protected ETH Bull";
    }

    function _afterRoundStart(uint assets) internal override {
        pool.deposit(assets, address(this));
        lastRoundBalance = totalAssets();
    }

    function _afterRoundEnd() internal override {
        uint underlyingBefore = asset.balanceOf(address(this));
        // Marks the amount interest gained in the round
        uint interest = totalAssets() - lastRoundBalance;
        // Pulls the yields from investor
        uint investmentYield = asset.balanceOf(investor);
        if(investmentYield > 0) {
            asset.safeTransferFrom(investor, address(this), investmentYield);
        }

        uint toPosition = asset.balanceOf(address(this)) - underlyingBefore;
        pool.deposit(toPosition, address(this));

        // Send round investment to investor
        uint investment = interest * investorRatio / DENOMINATOR;
        pool.withdraw(investment);
        asset.safeTransfer(investor, investment);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public override view returns(uint) {
        return pool.previewRedeem(pool.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        pool.withdraw(assets);
    }
}
