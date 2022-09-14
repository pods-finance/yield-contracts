// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IVault.sol";

contract Migration {
    using SafeERC20 for IERC20;

    IVault immutable from;
    IVault immutable to;

    constructor(IVault _from, IVault _to) {
        require(_from.asset() == _to.asset(), "Vault assets must be the same");
        from = _from;
        to = _to;
    }

    function migrate() external {
        uint256 shares = from.balanceOf(msg.sender);
        from.redeem(shares, address(this), msg.sender);

        IERC20 asset = IERC20(from.asset());
        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(to), balance);
        to.deposit(balance, msg.sender);
    }

    function migrateWithPermit(
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 shares = from.balanceOf(msg.sender);
        IERC20Permit(address(from)).permit(msg.sender, address(this), shares, deadline, v, r, s);
        from.redeem(shares, address(this), msg.sender);

        IERC20 asset = IERC20(from.asset());
        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(to), balance);
        to.deposit(balance, msg.sender);
    }
}
