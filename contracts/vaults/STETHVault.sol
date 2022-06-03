//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./BaseVault.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract STETHBullVault is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;

    uint256 public constant DENOMINATOR = 10000;

    uint256 public lastRoundAssets;
    uint256 public investorRatio = 5000;
    address public investor;

    constructor(
        address _asset,
        address _strategist,
        address _investor
    ) BaseVault(_asset, _strategist) {
        investor = _investor;
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external pure override returns (string memory) {
        return "STETH Bull Vault";
    }

    function _afterRoundStart(uint256 assets) internal override {
        lastRoundAssets = totalAssets();
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest;
        uint256 investmentYield = asset.balanceOf(investor);

        if (totalShares != 0) {
            roundAccruedInterest = totalAssets() - lastRoundAssets;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            // Send round investment to investor
            uint256 investment = (roundAccruedInterest * investorRatio) / DENOMINATOR;
            if (investment > 0) {
                asset.safeTransfer(investor, investment);
            }
        }
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
