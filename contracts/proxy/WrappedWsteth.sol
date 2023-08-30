// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

/**
 * @title RebasingWrapper
 * @author Pods Finance
 * @notice This is a fork from Lido's stETH code. The idea here is to create a wrapper
 * that modifies the behavior of exchange rate tokens (think wstETH) to be rebasing tokens
 * (think stETH). Exchange rate and rebasing tokens are very similar, as both are yield
 * bearing tokens, and they have subtle differences on how they store and display the yield.
 * Exchange rate tokens have a static balance for each account, and when they accrue value
 * they do it by changing the rate in which they are swapped to the underlying asset.
 * Rebasing tokens, on the other hand, have a static rate in which they are swapped to the
 * underlying asset, and when they accrue value they do it by changing the balance of each
 * account.
 * This wrapper is intended to be used with Exchange Rate tokens as underlying tokens, and
 * to provide a rebasing behavior to them.
 */

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Wrapper } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IwstETH } from "../interfaces/IwstETH.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { RebasingWrapper } from './RebasingWrapper.sol';

import "hardhat/console.sol";

contract WwstEth is RebasingWrapper {
    constructor() ERC20("wstETH Wrapper", "wwstETH") {}

  function invest(address vault, uint256 amount) override public returns (uint256) {
    depositFor(address(this), amount);
    uint256 newBalance = balanceOf(address(this));
    this.approve(vault, newBalance);
    return IERC4626(vault).deposit(newBalance, msg.sender);
  }

  function remove(address vault, uint256 amount) override public {
    uint256 _assets = IERC4626(vault).redeem(amount, msg.sender, msg.sender);
    withdrawTo(msg.sender, _assets);
  }

  /**
   * @return the amount of shares that corresponds to `assets` protocol-controlled assets.
   */
  function convertToExchangeRate(uint256 assets) override public view returns (uint256) {
      return IwstETH(underlyingToken).getWstETHByStETH(assets);
  }

  /**
   * @return the amount of assets that corresponds to `_sharesAmount` token shares.
   */
  function convertToRebasing(uint256 _sharesAmount) override public view returns (uint256) {
      return IwstETH(underlyingToken).getStETHByWstETH(_sharesAmount);
  }


  /**
   * @return the total amount (in wei) of assets controlled by the wrapper.
   * @dev This is used for calculating tokens from shares and vice versa.
   * @dev This function is required to be implemented in a derived contract.
   */
  function _getTotalPooledUnderlying() override internal view returns (uint256) {
    return IwstETH(underlyingToken).getStETHByWstETH(IwstETH(underlyingToken).balanceOf(address(this)));
  }


  /**
   * @notice Mints shares on behalf of 0xdead address,
   * the shares amount is equal to the contract's balance.     *
   *
   * Allows to get rid of zero checks for `totalShares` and `totalPooledEther`
   * and overcome corner cases.
   *
   * NB: reverts if the current contract's balance is zero.
   *
   * @dev must be invoked before using the token
   */
  function _bootstrapInitialHolder() override internal {
      uint256 balance = IwstETH(underlyingToken).balanceOf(address(this));
      assert(balance != 0);

      if (_getTotalShares() == 0) {
          // if protocol is empty bootstrap it with the contract's balance
          // address(0xdead) is a holder for initial shares
          // emitting `Submitted` before Transfer events to preserver events order in tx
          _mintInitialShares(balance);
      }
  }

}