//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./BaseVault.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract STETHVault is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;
    using FixedPointMath for FixedPointMath.Fractional;

    uint256 public constant DENOMINATOR = 10000;

    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    FixedPointMath.Fractional public lastSharePrice;

    uint256 public investorRatio = 5000;
    address public investor;

    event RoundData(uint256 indexed roundId, uint256 roundAccruedInterest, uint256 investmentYield, uint256 idleAssets);
    event SharePrice(uint256 indexed roundId, uint256 sharePrice);

    constructor(
        address _asset,
        address _strategist,
        address _investor
    ) BaseVault(_asset, _strategist) {
        investor = _investor;
        sharePriceDecimals = asset.decimals();
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external pure override returns (string memory) {
        return "stETH Vault";
    }

    function _afterRoundStart(uint256) internal override {
        lastRoundAssets = totalAssets();
        lastSharePrice = FixedPointMath.Fractional({
            numerator: totalShares == 0 ? 0 : lastRoundAssets,
            denominator: totalShares
        });

        uint256 sharePrice = lastSharePrice.denominator == 0 ? 0 : lastSharePrice.mulDivDown(10**sharePriceDecimals);
        emit SharePrice(currentRoundId, sharePrice);
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest;
        uint256 sharePrice;
        uint256 investmentYield = asset.balanceOf(investor);
        uint256 idleAssets = asset.balanceOf(address(this));

        if (totalShares != 0) {
            sharePrice = (totalAssets() + investmentYield).mulDivDown(10**sharePriceDecimals, totalShares);
            roundAccruedInterest = totalAssets() - lastRoundAssets;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            // Sends another batch to Investor
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;
            if (investmentAmount > 0) {
                asset.safeTransfer(investor, investmentAmount);
            }
        }

        emit RoundData(currentRoundId, roundAccruedInterest, investmentYield, idleAssets);
        emit SharePrice(currentRoundId, sharePrice);
    }

    function _beforeWithdraw(uint256 shares, uint256) internal override {
        lastRoundAssets -= shares.mulDivDown(lastSharePrice);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
