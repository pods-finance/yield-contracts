// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { ICurvePool } from "../interfaces/ICurvePool.sol";
import { IVault } from "../interfaces/IVault.sol";

contract ETHAdapter {
    using SafeERC20 for IERC20;
    using Address for address payable;

    ICurvePool public immutable pool;

    /**
     * @dev ETH coin index in the Curve Pool
     */
    int128 public constant ETH_INDEX = 0;

    /**
     * @dev stETH coin index in the Curve Pool
     */
    int128 public constant STETH_INDEX = 1;

    /**
     * @dev ETH token address representation
     */
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @dev stETH token address representation
     */
    address public constant STETH_ADDRESS = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

    error ETHAdapter__IncompatibleVault();
    error ETHAdapter__IncompatiblePool();

    constructor(ICurvePool _pool) {
        if (
            _pool.coins(uint256(uint128(ETH_INDEX))) != ETH_ADDRESS ||
            _pool.coins(uint256(uint128(STETH_INDEX))) != STETH_ADDRESS
        ) revert ETHAdapter__IncompatiblePool();
        pool = _pool;
    }

    function convertToSTETH(uint256 ethAmount) external view returns (uint256) {
        return pool.get_dy(ETH_INDEX, STETH_INDEX, ethAmount);
    }

    function convertToETH(uint256 stETHAmount) external view returns (uint256) {
        return pool.get_dy(STETH_INDEX, ETH_INDEX, stETHAmount);
    }

    function deposit(
        IVault vault,
        address receiver,
        uint256 minOutput
    ) external payable returns (uint256) {
        if (vault.asset() != STETH_ADDRESS) revert ETHAdapter__IncompatibleVault();
        uint256 assets = pool.exchange{ value: msg.value }(ETH_INDEX, STETH_INDEX, msg.value, minOutput);
        IERC20(vault.asset()).safeApprove(address(vault), assets);
        return vault.deposit(assets, receiver);
    }

    function redeem(
        IVault vault,
        uint256 shares,
        address receiver,
        uint256 minOutput
    ) external returns (uint256) {
        uint256 assets = vault.redeem(shares, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
        return assets;
    }

    function redeemWithPermit(
        IVault vault,
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
        IVault vault,
        uint256 assets,
        address receiver,
        uint256 minOutput
    ) external returns (uint256 shares) {
        shares = vault.withdraw(assets, address(this), msg.sender);
        _returnETH(vault, receiver, minOutput);
    }

    function withdrawWithPermit(
        IVault vault,
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

    /* We need this default function because this contract will
        receive ETH from the Curve pool
    */
    receive() external payable {}

    function _returnETH(
        IVault vault,
        address receiver,
        uint256 minOutput
    ) internal {
        if (vault.asset() != STETH_ADDRESS) revert ETHAdapter__IncompatibleVault();
        IERC20 asset = IERC20(vault.asset());

        uint256 balance = asset.balanceOf(address(this));
        asset.safeApprove(address(pool), balance);
        pool.exchange(STETH_INDEX, ETH_INDEX, balance, minOutput);

        payable(receiver).sendValue(address(this).balance);
    }
}
