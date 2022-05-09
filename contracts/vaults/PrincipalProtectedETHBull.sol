//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./BaseVault.sol";
import "hardhat/console.sol";

interface IYearnVault is IERC20 {
    function deposit(uint256 amount) external returns (uint256);
    function withdraw(uint256 maxShares, address recipient, uint256 maxLoss) external returns (uint256);
    function pricePerShare() external view returns (uint256);
}

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedETHBull is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;

    uint256 public constant DENOMINATOR = 10000;
    uint256 public constant BPS = 1;

    uint256 public lastRoundBalance;
    uint256 public investorRatio = 5000;
    address public investor;

    IYearnVault public vault;

    constructor(
        address _underlying,
        address _strategist,
        address _investor,
        address _pool
    ) BaseVault(_underlying, _strategist) {
        investor = _investor;
        vault = IYearnVault(_pool);
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external pure override returns (string memory) {
        return "Principal Protected ETH Bull";
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (assets > 0) {
            asset.approve(address(vault), assets);
            vault.deposit(assets);
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
            asset.approve(address(vault), toPosition);
            vault.deposit(toPosition);
        }

        // Send round investment to investor
        uint256 investment = (interest * investorRatio) / DENOMINATOR;
        if (investment > 0) {
            vault.withdraw(_assetsToShares(investment), address(this), BPS);
            asset.safeTransfer(investor, investment);
        }
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        uint yearnBalance = vault.balanceOf(address(this));

        return yearnBalance == 0 ? 0 : yearnBalance * vault.pricePerShare() / 10**uint(asset.decimals());
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        console.log("Price", vault.balanceOf(address(this)) * vault.pricePerShare());
        console.log("Assets", assets, _assetsToShares(assets));
        console.log("Before", asset.balanceOf(address(this)));
        vault.withdraw(_assetsToShares(assets) + 1, address(this), BPS);
        console.log("After ", asset.balanceOf(address(this)));
    }

    function _assetsToShares(uint assets) internal view returns(uint) {
        return assets.mulDivDown(1, vault.pricePerShare());
    }
}
