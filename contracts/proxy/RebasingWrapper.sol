// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;


import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Wrapper } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IwstETH } from "../interfaces/IwstETH.sol";

contract RebasingWrapper is ERC20, ERC20Permit, ERC20Wrapper {
  using SafeERC20 for ERC20;
  address payable public immutable underlyingToken;


  event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);

  event Withdraw(
      address indexed sender,
      address indexed receiver,
      address indexed owner,
      uint256 assets,
      uint256 shares
  );

  constructor(
    address payable _underlyingToken
  ) ERC20("Wrapped WETH yVault", "wyWETH")
    ERC20Permit("Wrapped WETH yVault")
    ERC20Wrapper(ERC20(_underlyingToken))
  {
    underlyingToken = _underlyingToken;
  }
  /**
   * @notice This is the decimals getter for the wrapped token.
   * @return Token decimals of the wrapped token.
   */
  function decimals() public view virtual override(ERC20, ERC20Wrapper) returns (uint8) {
      return ERC20(underlyingToken).decimals();
  }

  /**
   * @notice Returns the amount of underlying tokens that the wrapper holds.
   * @return Balance of the wrapper contract.
   */
  function totalAssets() public view virtual returns (uint256) {
      return ERC20(underlyingToken).balanceOf(address(this));
  }

  /**
   * @notice Returns the total value of underlying tokens that the wrapper holds.
   * @return Balance of the wrapper contract.
   */
  function totalSupply() public view virtual override(ERC20) returns (uint256) {
      return convertToShares(totalAssets());
  }

  /**
   * @notice This function reflects the “average-user’s” price-per-share, meaning 
   * what the average user should expect to see when exchanging to and from.
   * @param assets Amount of assets to be converted to shares.
   * @return shares Returns the amount of shares that the Vault would exchange for 
   * the amount of assets provided, in an ideal scenario where all the conditions are met.
   */
  function convertToShares(uint256 assets) public view returns (uint256 shares) {
    return IwstETH(underlyingToken).getStETHByWstETH(assets);
  }

  /**
   * @notice This function reflects the “average-user’s” share-per-asset, meaning 
   * what the average user should expect to see when exchanging to and from.
   * @param shares Amount of shares to be converted to assets.
   * @return assets Returns the amount of shares that the Vault would exchange for 
   * the amount of shares provided, in an ideal scenario where all the conditions are met.
   */
  function convertToAssets(uint256 shares) public view returns (uint256 assets) {
    return IwstETH(underlyingToken).getWstETHByStETH(shares);
  }

  /**
   * @notice Sender needs to approve this contract before calling deposit. This function transfers the assets from
   * sender to this contract, mints shares to receiver and emits a Deposit event. This function DOESNT support the
   * direct transfer of assets from sender to this contract. A user that directly transfers is donating assets to the
   * wrapper.
   * @param recipient Receiver of the shares.
   * @param assets Amount of assets to be deposited.
   */
  function depositFor(address recipient, uint256 assets) public virtual override(ERC20Wrapper) returns (bool)  {
    ERC20(underlyingToken).safeTransferFrom(msg.sender, address(this), assets);
    _mint(recipient, assets);
    uint256 shares = convertToShares(assets);
    emit Deposit(msg.sender, recipient, assets, shares);
    return true;
  }

  /**
   * @notice This function transfers the assets from this contract to the recipient, burns assets from the sender
   * and emits a Withdraw event. This function DOESNT support the direct transfer of assets from
   * sender to this contract. A user that directly transfers is donating assets to the wrapper
   * @param recipient Receiver of the shares.
   * @param shares Amount of shares to be deposited.
   */
  function withdrawTo(address recipient, uint256 shares) public virtual override(ERC20Wrapper) returns (bool) {
    uint256 assets = convertToAssets(shares);
    _burn(msg.sender, assets);
    ERC20(underlyingToken).safeTransfer(recipient, assets);
    emit Withdraw(msg.sender, recipient, recipient, assets, convertToShares(assets));
    return true;
  }

  /**
   * @notice This function returns the balance of the account in shares.
   * @param account User's address.
   * @return Balance of the account in shares.
   */
  function balanceOf(address account) public view virtual override returns (uint256) {
    return convertToShares(super.balanceOf(account));
  }

  /**
   * @notice This function returns the balance of the account in assets.
   * @param account User's address.
   */
  function assetsOf(address account) public view virtual returns (uint256) {
    return super.balanceOf(account);
  }

  /**
   * @notice We just convert shares to assets before calling the standart implementation. 
   */
  function transfer(address recipient, uint256 shares) public virtual override returns (bool) {
    uint256 assets = convertToAssets(shares);
    super.transfer(recipient, assets);
    return true;
  }

  /**
   * @notice We just convert shares to assets before calling the standart implementation. 
   */
  function approve(address spender, uint256 shares) public virtual override returns (bool) {
    // users may send uint256.max here. The convertToAssets function will break due to overflow
    if(shares == type(uint256).max) {
      super.approve(spender, type(uint256).max);
      return true;
    }
    uint256 assets = convertToAssets(shares);
    super.approve(spender, assets);
    return true;
  }

  /**
   * @notice We just convert shares to assets before calling the standart implementation. 
   */
  function transferFrom(address sender, address recipient, uint256 shares) public virtual override returns (bool) {
    uint256 assets = convertToAssets(shares);
    super.transferFrom(sender, recipient, assets);
    return true;
  }

  /**
   * @notice We just convert shares to assets before calling the standart implementation. 
   */
  function increaseAllowance(address spender, uint256 shares) public virtual override returns (bool) {
    uint256 assets = convertToAssets(shares);
    super.increaseAllowance(spender, assets);
    return true;
  }

  /**
   * @notice We just convert shares to assets before calling the standart implementation. 
   */
  function decreaseAllowance(address spender, uint256 shares) public virtual override returns (bool) {
    uint256 assets = convertToAssets(shares);
    super.decreaseAllowance(spender, assets);
    return true;
  }
}