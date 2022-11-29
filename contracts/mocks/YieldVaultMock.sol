// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { BaseVault } from "../vaults/BaseVault.sol";
import { YieldSourceMock } from "./YieldSourceMock.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IConfigurationManager } from "../interfaces/IConfigurationManager.sol";
import { IVault } from "../interfaces/IVault.sol";

contract YieldVaultMock is BaseVault {
    YieldSourceMock public yieldSource;
    using Math for uint256;

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _yieldSource
    ) BaseVault(_configuration, _asset, "YieldVaultMock", "YVM") {
        yieldSource = YieldSourceMock(_yieldSource);
    }

    /**
     * @inheritdoc IVault
     */
    function assetsOf(address owner) external view virtual returns (uint256) {
        uint256 shares = balanceOf(owner);
        return convertToAssets(shares) + idleAssetsOf(owner);
    }

    function totalAssets() public view override returns (uint256) {
        return yieldSource.convertToAssets(yieldSource.balanceOf(address(this))) + vaultState.processedDeposits;
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        yieldSource.withdraw(assets, address(this), address(this));
    }

    function _afterRoundStart() internal override {
        if (yieldSource.previewDeposit(vaultState.processedDeposits) > 0) {
            IERC20Metadata(yieldSource.asset()).approve(address(yieldSource), vaultState.processedDeposits);
            yieldSource.deposit(vaultState.processedDeposits, address(this));
        }
    }
}
