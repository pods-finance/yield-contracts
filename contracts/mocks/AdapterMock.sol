// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Asset } from "./Asset.sol";
import { IVault } from "../interfaces/IVault.sol";

contract AdapterMock is Ownable {
    using SafeERC20 for IERC20;
    using Address for address payable;

    /**
     * @notice ETH coin index
     */
    int128 public constant ETH_INDEX = 0;

    /**
     * @notice stETH coin index
     */
    int128 public constant STETH_INDEX = 1;

    /**
     * @notice ETH token address representation
     */
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice stETH token address representation
     */
    address public immutable STETH_ADDRESS;

    error ETHAdapter__IncompatibleVault();
    error ETHAdapter__IncompatiblePool();

    constructor(address _asset) {
        STETH_ADDRESS = _asset;
    }

    /**
     * @notice Convert `ethAmount` ETH to stETH
     * @param ethAmount Amount of ETH to convert
     * @return uint256 Amount of stETH received in exchange
     */
    function convertToSTETH(uint256 ethAmount) external view returns (uint256) {
        return ethAmount;
    }

    /**
     * @notice Convert 'stETHAmount' stETH to ETH
     * @param stETHAmount Amount of stETH to convert
     * @return uint256 Amount of ETH received in exchange
     */
    function convertToETH(uint256 stETHAmount) external view returns (uint256) {
        return stETHAmount;
    }

    /**
     * @notice Deposit `msg.value` of ETH, convert to stETH and deposit into `vault`
     * @param vault Pods' strategy vault that will receive the stETH
     * @param receiver Address that will be the owner of the Vault's shares
     * @param minOutput slippage control. Minimum acceptable amount of stETH
     * @return uint256 Amount of shares returned by vault ERC4626 contract
     */
    function deposit(
        IVault vault,
        address receiver,
        uint256 minOutput
    ) external payable returns (uint256) {
        if (vault.asset() != STETH_ADDRESS) revert ETHAdapter__IncompatibleVault();
        require(msg.value >= minOutput, "Exchange resulted in fewer coins than expected");
        uint256 assets = msg.value;
        Asset(vault.asset()).mint(assets);
        IERC20(vault.asset()).safeIncreaseAllowance(address(vault), assets);
        return vault.deposit(assets, receiver);
    }

    /**
     * @notice Redeem `shares` shares, receive stETH, trade stETH for ETH and send to receiver
     * @param vault Pods' strategy vault that will receive the shares and payback stETH
     * @param shares Amount of Vault's shares to redeem
     * @param receiver Address that will receive back the ETH withdrawn from the `vault`
     * @param minOutput slippage control. Minimum acceptable amount of ETH
     * @return uint256 Amount of assets received from Vault ERC4626
     */
    function redeem(
        IVault vault,
        uint256 shares,
        address receiver,
        uint256 minOutput
    ) external returns (uint256) {
        uint256 assets = vault.redeem(shares, address(this), msg.sender);
        Asset(vault.asset()).burn(assets);
        payable(receiver).sendValue(assets);
        return assets;
    }

    /**
     * @notice redeemWithPermit `shares` shares, receive stETH, trade stETH for ETH and send to receiver
     * @dev Do not need to approve the shares in advance. The vault tokenized shares supports Permit
     * @param vault Pods' strategy vault that will receive the shares and payback stETH
     * @param shares Amount of Vault's shares to redeem
     * @param receiver Address that will receive back the ETH withdrawn from `vault`
     * @param minOutput slippage control. Minimum acceptable amount of ETH
     * @param deadline deadline that this transaction will be valid
     * @param v recovery id
     * @param r ECDSA signature output
     * @param s ECDSA signature output
     * @return assets Amount of assets received from Vault ERC4626
     */
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
        Asset(vault.asset()).burn(assets);
        payable(receiver).sendValue(assets);
    }

    /**
     * @notice Withdraw `assets` assets, receive stETH, trade stETH for ETH and send to receiver
     * @dev Do not need to approve the shares in advance. The vault tokenized shares supports Permit
     * @param vault Pods' strategy vault that will receive the shares and payback stETH
     * @param assets Amount of assets (stETH) to redeem
     * @param receiver Address that will receive back the ETH withdrawn from the Vault
     * @param minOutput slippage control. Minimum acceptable amount of ETH
     * @return shares Amount of shares burned in order to receive assets
     */
    function withdraw(
        IVault vault,
        uint256 assets,
        address receiver,
        uint256 minOutput
    ) external returns (uint256 shares) {
        shares = vault.withdraw(assets, address(this), msg.sender);
        Asset(vault.asset()).burn(assets);
        payable(receiver).sendValue(assets);
    }

    /**
     * @notice withdrawWithPermit `assets` assets, receive stETH, trade stETH for ETH and send to receiver
     * @dev Do not need to approve the shares in advance. Vault's tokenized shares supports Permit
     * @param vault Pods' strategy vault that will receive the shares and payback stETH
     * @param assets Amount of assets (stETH) to redeem
     * @param receiver Address that will receive back the ETH withdrawn from the Vault
     * @param minOutput slippage control. Minimum acceptable amount of ETH
     * @param deadline deadline that this transaction will be valid
     * @param v recovery id
     * @param r ECDSA signature output
     * @param s ECDSA signature output
     * @return shares Amount of shares burned in order to receive assets
     */
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
        Asset(vault.asset()).burn(assets);
        payable(receiver).sendValue(assets);
    }

    function drain() external onlyOwner {
        IERC20(STETH_ADDRESS).transfer(owner(), IERC20(STETH_ADDRESS).balanceOf(address(this)));
        payable(owner()).sendValue(address(this).balance);
    }

    /* We need this default function because this contract will
        receive ETH
    */
    receive() external payable {}
}
