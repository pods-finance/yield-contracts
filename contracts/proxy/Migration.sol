// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IConfigurationManager } from "../interfaces/IConfigurationManager.sol";
import { IVault } from "../interfaces/IVault.sol";

contract Migration {
    using SafeERC20 for IERC20;

    IConfigurationManager public immutable configuration;

    error Migration__MigrationNotAllowed();

    constructor(IConfigurationManager _configuration) {
        configuration = _configuration;
    }

    function migrate(
        IVault from,
        IVault to,
        uint256 shares
    ) external returns (uint256) {
        if (!configuration.isVaultMigrationAllowed(address(from), address(to))) {
            revert Migration__MigrationNotAllowed();
        }

        from.redeem(shares, address(this), msg.sender);

        IERC20 asset = IERC20(from.asset());
        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(to), balance);
        return to.deposit(balance, msg.sender);
    }

    function migrateWithPermit(
        IVault from,
        IVault to,
        uint256 shares,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256) {
        if (!configuration.isVaultMigrationAllowed(address(from), address(to))) {
            revert Migration__MigrationNotAllowed();
        }

        IERC20Permit(address(from)).permit(msg.sender, address(this), shares, deadline, v, r, s);
        from.redeem(shares, address(this), msg.sender);

        IERC20 asset = IERC20(from.asset());
        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(to), balance);
        return to.deposit(balance, msg.sender);
    }
}
