// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/ICurvePool.sol";
import "../interfaces/IVaultMetadata.sol";

contract ETHAdapter {
    using SafeERC20 for IERC20;
    using Address for address payable;

    ICurvePool public immutable pool;

    constructor(ICurvePool _pool) {
        pool = _pool;
    }

    function convertToSTETH(uint256 ethAmount) public view returns (uint256 stETHAmount) {
        return pool.get_dy(0, 1, ethAmount);
    }

    function convertToETH(uint256 stETHAmount) public view returns (uint256 ethAmount) {
        return pool.get_dy(1, 0, stETHAmount);
    }

    function deposit(
        IVaultMetadata vault,
        address receiver,
        uint256 minOutput
    ) external payable returns (uint256 shares) {
        uint256 assets = pool.exchange{ value: msg.value }(0, 1, msg.value, minOutput);
        IERC20(vault.asset()).safeApprove(address(vault), assets);
        return vault.deposit(assets, receiver);
    }

    function redeem(
        IVaultMetadata vault,
        uint256 shares,
        address receiver,
        uint256 minOutput
    ) external returns (uint256 assets) {
        assets = vault.redeem(shares, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
    }

    function redeemWithPermit(
        IVaultMetadata vault,
        uint256 shares,
        address receiver,
        uint256 minOutput,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 assets) {
        vault.permit(msg.sender, address(this), shares, deadline, v, r, s);
        assets = vault.redeem(shares, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
    }

    function withdraw(
        IVaultMetadata vault,
        uint256 assets,
        address receiver,
        uint256 minOutput
    ) external returns (uint256 shares) {
        shares = vault.withdraw(assets, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
    }

    function withdrawWithPermit(
        IVaultMetadata vault,
        uint256 assets,
        address receiver,
        uint256 minOutput,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 shares) {
        shares = vault.convertToShares(assets);
        vault.permit(msg.sender, address(this), shares, deadline, v, r, s);
        shares = vault.withdraw(assets, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
    }

    receive() external payable {}

    function _returnETH(
        IVaultMetadata vault,
        address receiver,
        uint256 minOutput
    ) internal {
        IERC20 asset = IERC20(vault.asset());

        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(pool), balance);
        pool.exchange(1, 0, balance, minOutput);

        payable(receiver).sendValue(address(this).balance);
    }
}
