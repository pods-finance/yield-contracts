// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../vaults/BaseVault.sol";
import "../mocks/YieldSourceMock.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedMock is BaseVault {
    using SafeERC20 for IERC20Metadata;
    using AuxMath for uint256;
    using AuxMath for AuxMath.Fractional;

    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    AuxMath.Fractional public lastSharePrice;

    uint256 public investorRatio = 5000;
    address public investor;

    YieldSourceMock public yieldSource;

    event StartRoundData(uint256 indexed roundId, uint256 lastRoundAssets, uint256 sharePrice);
    event EndRoundData(
        uint256 indexed roundId,
        uint256 roundAccruedInterest,
        uint256 investmentYield,
        uint256 idleAssets
    );
    event SharePrice(uint256 indexed roundId, uint256 startSharePrice, uint256 endSharePrice);

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor,
        address _yieldSource
    ) BaseVault(_configuration, _asset) {
        investor = _investor;
        yieldSource = YieldSourceMock(_yieldSource);
        sharePriceDecimals = _asset.decimals();
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (assets > 0) {
            _asset.approve(address(yieldSource), assets);
            yieldSource.deposit(assets, address(this));
        }
        uint256 supply = totalSupply();

        lastRoundAssets = totalAssets();
        lastSharePrice = AuxMath.Fractional({ numerator: supply == 0 ? 0 : lastRoundAssets, denominator: supply });

        uint256 sharePrice = lastSharePrice.denominator == 0 ? 0 : lastSharePrice.mulDivDown(10**sharePriceDecimals);
        emit StartRoundData(currentRoundId, lastRoundAssets, sharePrice);
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest = 0;
        uint256 endSharePrice = 0;
        uint256 investmentYield = _asset.balanceOf(investor);
        uint256 idleAssets = _asset.balanceOf(address(this));
        uint256 supply = totalSupply();

        if (supply != 0) {
            endSharePrice = (totalAssets() + investmentYield).mulDivDown(10**sharePriceDecimals, supply);
            roundAccruedInterest = totalAssets() - lastRoundAssets;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                _asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            // Redeposit to Yield source
            uint256 redepositAmount = _asset.balanceOf(address(this)) - idleAssets;
            if (redepositAmount > 0) {
                _asset.approve(address(yieldSource), redepositAmount);
                yieldSource.deposit(redepositAmount, address(this));
            }

            // Sends another batch to Investor
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;
            if (investmentAmount > 0) {
                yieldSource.withdraw(investmentAmount);
                _asset.safeTransfer(investor, investmentAmount);
            }
        }

        uint256 startSharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.mulDivDown(10**sharePriceDecimals);

        emit EndRoundData(currentRoundId, roundAccruedInterest, investmentYield, idleAssets);
        emit SharePrice(currentRoundId, startSharePrice, endSharePrice);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return yieldSource.previewRedeem(yieldSource.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256 shares, uint256 assets) internal override {
        lastRoundAssets -= shares.mulDivDown(lastSharePrice);
        yieldSource.withdraw(assets);
    }
}
