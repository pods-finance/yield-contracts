//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../vaults/BaseVault.sol";
import "../mocks/YieldSourceMock.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedMock is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;

    uint256 public constant DENOMINATOR = 10000;

    uint256 public lastRoundBalance;
    uint256 public investorRatio = 5000;
    address public investor;

    YieldSourceMock public pool;

    constructor(
        address _underlying,
        address _strategist,
        address _investor,
        address _pool
    ) BaseVault(_underlying, _strategist) {
        investor = _investor;
        pool = YieldSourceMock(_pool);
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external pure override returns (string memory) {
        return "Principal Protected ETH Bull";
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (assets > 0) {
            asset.approve(address(pool), assets);
            pool.deposit(assets, address(this));
        }
        lastRoundBalance = totalAssets();
    }

    function _afterRoundEnd() internal override {
        uint256 underlyingBefore = asset.balanceOf(address(this));
        // Marks the amount interest gained in the round
        uint256 interest = totalAssets() - lastRoundBalance;
        // Pulls the yields from investor
        uint256 investmentYield = asset.balanceOf(investor);
        if (investmentYield > 0) {
            asset.safeTransferFrom(investor, address(this), investmentYield);
        }

        uint256 toPosition = asset.balanceOf(address(this)) - underlyingBefore;
        if (toPosition > 0) {
            asset.approve(address(pool), toPosition);
            pool.deposit(toPosition, address(this));
        }

        // Send round investment to investor
        uint256 investment = (interest * investorRatio) / DENOMINATOR;
        if (investment > 0) {
            pool.withdraw(investment);
            asset.safeTransfer(investor, investment);
        }
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return pool.previewRedeem(pool.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        pool.withdraw(assets);
    }
}
