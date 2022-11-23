// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IConfigurationManager } from "../interfaces/IConfigurationManager.sol";
import { IVault } from "../interfaces/IVault.sol";
import { BaseVault } from "../vaults/BaseVault.sol";
import { YieldSourceMock } from "../mocks/YieldSourceMock.sol";

/**
 * @title A Vault that use variable weekly yields to buy strangles
 * @author Pods Finance
 */
contract PrincipalProtectedMock is BaseVault {
    using SafeERC20 for IERC20Metadata;
    using Math for uint256;

    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    Fractional public lastSharePrice;

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
    ) BaseVault(_configuration, _asset, "PrincipalProtectedMock", "PPM") {
        investor = _investor;
        yieldSource = YieldSourceMock(_yieldSource);
        sharePriceDecimals = _asset.decimals();
    }

    function _afterRoundStart() internal override {
        lastRoundAssets = totalAssets();
        if (vaultState.processedDeposits > 0) {
            IERC20Metadata(asset()).approve(address(yieldSource), vaultState.processedDeposits);
            yieldSource.deposit(vaultState.processedDeposits, address(this));
        }
        uint256 supply = totalSupply();

        lastSharePrice = Fractional({ numerator: supply == 0 ? 0 : lastRoundAssets, denominator: supply });

        uint256 sharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);
        emit StartRoundData(vaultState.currentRoundId, lastRoundAssets, sharePrice);
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest = 0;
        uint256 endSharePrice = 0;
        uint256 investmentYield = IERC20Metadata(asset()).balanceOf(investor);
        uint256 idleAssets = IERC20Metadata(asset()).balanceOf(address(this));
        uint256 supply = totalSupply();

        if (supply != 0) {
            endSharePrice = (totalAssets() + investmentYield).mulDiv(
                10**sharePriceDecimals,
                supply,
                Math.Rounding.Down
            );
            roundAccruedInterest = totalAssets() - lastRoundAssets;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                IERC20Metadata(asset()).safeTransferFrom(investor, address(this), investmentYield);
            }

            // Redeposit to Yield source
            uint256 redepositAmount = IERC20Metadata(asset()).balanceOf(address(this)) - idleAssets;
            if (redepositAmount > 0) {
                IERC20Metadata(asset()).approve(address(yieldSource), redepositAmount);
                yieldSource.deposit(redepositAmount, address(this));
            }

            // Sends another batch to Investor
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;
            if (investmentAmount > 0) {
                yieldSource.withdraw(investmentAmount, address(this), address(this));
                IERC20Metadata(asset()).safeTransfer(investor, investmentAmount);
            }
        }

        uint256 startSharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);

        emit EndRoundData(vaultState.currentRoundId, roundAccruedInterest, investmentYield, idleAssets);
        emit SharePrice(vaultState.currentRoundId, startSharePrice, endSharePrice);
    }

    /**
     * @inheritdoc IVault
     */
    function assetsOf(address owner) external view virtual returns (uint256) {
        uint256 supply = totalSupply();
        uint256 shares = balanceOf(owner);
        uint256 committedAssets = supply == 0
            ? 0
            : shares.mulDiv(IERC20Metadata(asset()).balanceOf(address(this)), supply, Math.Rounding.Down);
        return convertToAssets(shares) + idleAssetsOf(owner) + committedAssets;
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override(ERC4626, IERC4626) returns (uint256) {
        return yieldSource.previewRedeem(yieldSource.balanceOf(address(this))) + vaultState.processedDeposits;
    }

    function _beforeWithdraw(uint256 shares, uint256 assets) internal override {
        lastRoundAssets -= shares.mulDiv(lastSharePrice.numerator, lastSharePrice.denominator, Math.Rounding.Down);
        yieldSource.withdraw(assets, address(this), address(this));
    }
}
