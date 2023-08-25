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

import "hardhat/console.sol";

contract RebasingWrapper is ERC20 {
    bool isInitialized = false;
    address payable public immutable underlyingToken;
    constructor(
      address payable _underlyingToken
    ) ERC20("Rebasing Wrapper", "rWSTETH") {
      underlyingToken = _underlyingToken;
    }
    address constant internal INITIAL_TOKEN_HOLDER = 0x000000000000000000000000000000000000dEaD;
    uint256 constant internal INFINITE_ALLOWANCE = ~uint256(0);

    /**
     * @notice We need an initialization function to be called after the deployent because we need the deployment
     * address to transfer a small amount of underlying tokens to it. Transfering some underlying tokens to the
     * wrapper and minting it to the INITIAL_TOKEN_HOLDER allows us to drop the checks for zero shares throughout
     * the code, as well as to avoid corner cases and potential attacks.
     * Before calling initialize, it's required that the deployer transfer some underlying tokens to the wrapper.
     */
    function initialize() public {
      require(!isInitialized, "already initialized");
      isInitialized = true;
      _bootstrapInitialHolder();
    }
      

    /**
     * @dev Rebasing (wrapped) balances are dynamic and are calculated based on the accounts' shares
     * and the total amount of underlying assets controlled by the protocol. Account shares aren't
     * normalized, so the contract also stores the sum of all shares to calculate
     * each account's token balance which equals to:
     *
     *   shares[account] * _getTotalPooledUnderlying() / _getTotalShares()
    */
    mapping (address => uint256) private shares;

    /**
     * @dev Allowances are nominated in wrapped tokens, not underlying tokens.
     */
    mapping (address => mapping (address => uint256)) private allowances;

    /**
     * @dev Summation of all shares.
     */
    uint256 totalSharesPosition;

    /**
      * @notice An executed shares transfer from `sender` to `recipient`.
      *
      * @dev emitted in pair with an ERC20-defined `Transfer` event.
      */
    event TransferShares(
        address indexed from,
        address indexed to,
        uint256 sharesValue
    );

    /**
     * @notice An executed `burnShares` request
     *
     * @dev Reports simultaneously burnt shares amount
     * and corresponding rebasing amount.
     * The rebasing amount is calculated twice: before and after the burning incurred rebase.
     *
     * @param account holder of the burnt shares
     * @param preRebaseTokenAmount amount of rebasing the burnt shares corresponded to before the burn
     * @param postRebaseTokenAmount amount of rebasing the burnt shares corresponded to after the burn
     * @param sharesAmount amount of burnt shares
     */
    event SharesBurnt(
        address indexed account,
        uint256 preRebaseTokenAmount,
        uint256 postRebaseTokenAmount,
        uint256 sharesAmount
    );

  function invest(address vault, uint256 amount) public returns (uint256) {
    depositFor(address(this), amount);
    uint256 newBalance = balanceOf(address(this));
    this.approve(vault, newBalance);
    return IERC4626(vault).deposit(newBalance, msg.sender);
  }

  function remove(address vault, uint256 amount) public {
    uint256 _assets = IERC4626(vault).redeem(amount, msg.sender, msg.sender);
    withdrawTo(msg.sender, _assets);
  }

   /**
   * @notice Sender needs to approve this contract before calling depositFor. This function transfers the assets from
   * sender to this contract, mints shares to receiver and emits a Deposit event. This function DOES NOT support the
   * direct transfer of assets from sender to this contract. A user that directly transfers is donating assets to the
   * wrapper.
   * @param recipient Receiver of the shares.
   * @param underlyingAmount Amount of underlying tokens to be deposited.
   */
  function depositFor(address recipient, uint256 underlyingAmount) public virtual returns (bool)  {
    require(ERC20(underlyingToken).transferFrom(msg.sender, address(this), underlyingAmount), "ERC20 transfer failed");
    _mintShares(recipient, underlyingAmount);
    return true;
  }

  /**
   * @notice This function transfers the assets from this contract to the recipient, burns assets from the sender
   * and emits a Withdraw event. This function DOESNT support the direct transfer of assets from
   * sender to this contract. A user that directly transfers is donating assets to the wrapper
   * @param recipient Receiver of the shares.
   * @param wrappedAmount Amount of shares to be withdrawn.
   */
  function withdrawTo(address recipient, uint256 wrappedAmount) public virtual returns (bool) {
    uint256 _assets = convertToExchangeRate(wrappedAmount);
    _burnShares(msg.sender, _assets);
    require(ERC20(underlyingToken).transfer(recipient, _assets), "ERC20 transfer failed");
    _emitTransferEvents(msg.sender, recipient, wrappedAmount, _assets);
    return true;
  }

    /**
     * @return the amount of rebasing tokens in existence.
     *
     * @dev Always equals to `_getTotalPooledUnderlying()` since token amount
     * is pegged to the total amount of assets controlled by the rebasing wrapper.
     */
    function totalSupply() public view override(ERC20)  returns (uint256) {
        return _getTotalPooledUnderlying();
    }

    /**
     * @return the entire amount of underlying controlled by the protocol.
     *
     * @dev The sum of all assets in the wrapper, equals to the total supply of rebasing tokens.
     */
    function getTotalPooledAssets() external view returns (uint256) {
        return _getTotalPooledUnderlying();
    }

    /**
     * @return the amount of tokens owned by the `_account`.
     *
     * @dev Balances are dynamic and equal the `_account`'s share in the amount of the
     * total assets controlled by the wrapper. See `sharesOf`.
     */
    function balanceOf(address _account) public view override(ERC20)  returns (uint256) {
        return convertToRebasing(_sharesOf(_account));
    }

    /**
     * @notice Moves `_amount` tokens from the caller's account to the `_recipient` account.
     *
     * @return a boolean value indicating whether the operation succeeded.
     * Emits a `Transfer` event.
     * Emits a `TransferShares` event.
     *
     * Requirements:
     *
     * - `_recipient` cannot be the zero address.
     * - the caller must have a balance of at least `_amount`.
     * - the contract must not be paused.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transfer(address _recipient, uint256 _amount) public override(ERC20)  returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /**
     * @return the remaining number of tokens that `_spender` is allowed to spend
     * on behalf of `_owner` through `transferFrom`. This is zero by default.
     *
     * @dev This value changes when `approve` or `transferFrom` is called.
     */
    function allowance(address _owner, address _spender) public override(ERC20) view returns (uint256) {
        return allowances[_owner][_spender];
    }

    /**
     * @notice Sets `_amount` as the allowance of `_spender` over the caller's tokens.
     *
     * @return a boolean value indicating whether the operation succeeded.
     * Emits an `Approval` event.
     *
     * Requirements:
     *
     * - `_spender` cannot be the zero address.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function approve(address _spender, uint256 _amount) public override(ERC20) returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    /**
     * @notice Moves `_amount` tokens from `_sender` to `_recipient` using the
     * allowance mechanism. `_amount` is then deducted from the caller's
     * allowance.
     *
     * @return a boolean value indicating whether the operation succeeded.
     *
     * Emits a `Transfer` event.
     * Emits a `TransferShares` event.
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_sender` and `_recipient` cannot be the zero addresses.
     * - `_sender` must have a balance of at least `_amount`.
     * - the caller must have allowance for `_sender`'s tokens of at least `_amount`.
     * - the contract must not be paused.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transferFrom(address _sender, address _recipient, uint256 _amount) public override(ERC20) returns (bool) {
        _spendAllowance(_sender, msg.sender, _amount);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `_spender` by the caller by `_addedValue`.
     *
     * This is an alternative to `approve` that can be used as a mitigation for
     * problems described in:
     * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/b709eae01d1da91902d06ace340df6b324e6f049/contracts/token/ERC20/IERC20.sol#L57
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_spender` cannot be the the zero address.
     */
    function increaseAllowance(address _spender, uint256 _addedValue) public override(ERC20) returns (bool) {
        _approve(msg.sender, _spender, allowances[msg.sender][_spender] + _addedValue);
        return true;
    }

    /**
     * @notice Atomically decreases the allowance granted to `_spender` by the caller by `_subtractedValue`.
     *
     * This is an alternative to `approve` that can be used as a mitigation for
     * problems described in:
     * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/b709eae01d1da91902d06ace340df6b324e6f049/contracts/token/ERC20/IERC20.sol#L57
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_spender` cannot be the zero address.
     * - `_spender` must have allowance for the caller of at least `_subtractedValue`.
     */
    function decreaseAllowance(address _spender, uint256 _subtractedValue) public override(ERC20) returns (bool) {
        uint256 currentAllowance = allowances[msg.sender][_spender];
        require(currentAllowance >= _subtractedValue, "ALLOWANCE_BELOW_ZERO");
        _approve(msg.sender, _spender, currentAllowance - _subtractedValue);
        return true;
    }

    /**
     * @return the total amount of shares in existence.
     *
     * @dev The sum of all accounts' shares can be an arbitrary number, therefore
     * it is necessary to store it in order to calculate each account's relative share.
     */
    function getTotalShares() external view returns (uint256) {
        return _getTotalShares();
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function sharesOf(address _account) external view returns (uint256) {
        return _sharesOf(_account);
    }

    /**
     * @return the amount of shares that corresponds to `assets` protocol-controlled assets.
     */
    function convertToExchangeRate(uint256 assets) public view returns (uint256) {
        return IwstETH(underlyingToken).getWstETHByStETH(assets);
    }

    /**
     * @return the amount of assets that corresponds to `_sharesAmount` token shares.
     */
    function convertToRebasing(uint256 _sharesAmount) public view returns (uint256) {
        return IwstETH(underlyingToken).getStETHByWstETH(_sharesAmount);
    }

    /**
     * @notice Moves `_sharesAmount` token shares from the caller's account to the `_recipient` account.
     *
     * @return amount of transferred tokens.
     * Emits a `TransferShares` event.
     * Emits a `Transfer` event.
     *
     * Requirements:
     *
     * - `_recipient` cannot be the zero address.
     * - the caller must have at least `_sharesAmount` shares.
     * - the contract must not be paused.
     *
     * @dev The `_sharesAmount` argument is the amount of shares, not tokens.
     */
    function transferShares(address _recipient, uint256 _sharesAmount) external returns (uint256) {
        _transferShares(msg.sender, _recipient, _sharesAmount);
        uint256 tokensAmount = convertToRebasing(_sharesAmount);
        _emitTransferEvents(msg.sender, _recipient, tokensAmount, _sharesAmount);
        return tokensAmount;
    }

    /**
     * @notice Moves `_sharesAmount` token shares from the `_sender` account to the `_recipient` account.
     *
     * @return amount of transferred tokens.
     * Emits a `TransferShares` event.
     * Emits a `Transfer` event.
     *
     * Requirements:
     *
     * - `_sender` and `_recipient` cannot be the zero addresses.
     * - `_sender` must have at least `_sharesAmount` shares.
     * - the caller must have allowance for `_sender`'s tokens of at least `convertToRebasing(_sharesAmount)`.
     * - the contract must not be paused.
     *
     * @dev The `_sharesAmount` argument is the amount of shares, not tokens.
     */
    function transferSharesFrom(
        address _sender, address _recipient, uint256 _sharesAmount
    ) external returns (uint256) {
        uint256 tokensAmount = convertToRebasing(_sharesAmount);
        _spendAllowance(_sender, msg.sender, tokensAmount);
        _transferShares(_sender, _recipient, _sharesAmount);
        _emitTransferEvents(_sender, _recipient, tokensAmount, _sharesAmount);
        return tokensAmount;
    }

    /**
     * @return the total amount (in wei) of assets controlled by the wrapper.
     * @dev This is used for calculating tokens from shares and vice versa.
     * @dev This function is required to be implemented in a derived contract.
     */
    function _getTotalPooledUnderlying() internal view returns (uint256) {
      return IwstETH(underlyingToken).getStETHByWstETH(IwstETH(underlyingToken).balanceOf(address(this)));
    }

    /**
     * @notice Moves `_amount` tokens from `_sender` to `_recipient`.
     * Emits a `Transfer` event.
     * Emits a `TransferShares` event.
     */
    function _transfer(address _sender, address _recipient, uint256 _amount) internal override(ERC20){
        uint256 _sharesToTransfer = convertToExchangeRate(_amount);
        _transferShares(_sender, _recipient, _sharesToTransfer);
        _emitTransferEvents(_sender, _recipient, _amount, _sharesToTransfer);
    }

    /**
     * @notice Sets `_amount` as the allowance of `_spender` over the `_owner` s tokens.
     *
     * Emits an `Approval` event.
     *
     * NB: the method can be invoked even if the protocol paused.
     *
     * Requirements:
     *
     * - `_owner` cannot be the zero address.
     * - `_spender` cannot be the zero address.
     */
    function _approve(address _owner, address _spender, uint256 _amount) internal override(ERC20) {
        require(_owner != address(0), "APPROVE_FROM_ZERO_ADDR");
        require(_spender != address(0), "APPROVE_TO_ZERO_ADDR");

        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(address _owner, address _spender, uint256 _amount) internal override(ERC20) {
        uint256 currentAllowance = allowances[_owner][_spender];
        if (currentAllowance != INFINITE_ALLOWANCE) {
            require(currentAllowance >= _amount, "ALLOWANCE_EXCEEDED");
            _approve(_owner, _spender, currentAllowance - _amount);
        }
    }

    /**
     * @return the total amount of shares in existence.
     */
    function _getTotalShares() internal view returns (uint256) {
        return totalSharesPosition;
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function _sharesOf(address _account) internal view returns (uint256) {
        return shares[_account];
    }

    /**
     * @notice Moves `_sharesAmount` shares from `_sender` to `_recipient`.
     *
     * Requirements:
     *
     * - `_sender` cannot be the zero address.
     * - `_recipient` cannot be the zero address or the rebasing token contract itself
     * - `_sender` must hold at least `_sharesAmount` shares.
     * - the contract must not be paused.
     */
    function _transferShares(address _sender, address _recipient, uint256 _sharesAmount) internal {
        require(_sender != address(0), "TRANSFER_FROM_ZERO_ADDR");
        require(_recipient != address(0), "TRANSFER_TO_ZERO_ADDR");
        require(_recipient != address(this), "TRANSFER_TO_CONTRACT");

        uint256 currentSenderShares = shares[_sender];
        require(_sharesAmount <= currentSenderShares, "BALANCE_EXCEEDED");

        shares[_sender] = currentSenderShares - _sharesAmount;
        shares[_recipient] = shares[_recipient] + _sharesAmount;
    }

    /**
     * @notice Creates `_sharesAmount` shares and assigns them to `_recipient`, increasing the total amount of shares.
     * @dev This doesn't increase the token total supply.
     *
     * NB: The method doesn't check protocol pause relying on the external enforcement.
     *
     * Requirements:
     *
     * - `_recipient` cannot be the zero address.
     * - the contract must not be paused.
     */
    function _mintShares(address _recipient, uint256 _sharesAmount) internal returns (uint256 newTotalShares) {
        require(_recipient != address(0), "MINT_TO_ZERO_ADDR");

        newTotalShares = _getTotalShares() + _sharesAmount;
        totalSharesPosition = newTotalShares;

        shares[_recipient] = shares[_recipient] + _sharesAmount;

        _emitTransferAfterMintingShares(_recipient, _sharesAmount);
    }

    /**
     * @notice Destroys `_sharesAmount` shares from `_account`'s holdings, decreasing the total amount of shares.
     * @dev This doesn't decrease the token total supply.
     *
     * Requirements:
     *
     * - `_account` cannot be the zero address.
     * - `_account` must hold at least `_sharesAmount` shares.
     * - the contract must not be paused.
     */
    function _burnShares(address _account, uint256 _sharesAmount) internal returns (uint256 newTotalShares) {
        require(_account != address(0), "BURN_FROM_ZERO_ADDR");

        uint256 accountShares = shares[_account];
        require(_sharesAmount <= accountShares, "BALANCE_EXCEEDED");

        uint256 preRebaseTokenAmount = convertToRebasing(_sharesAmount);

        newTotalShares = _getTotalShares() - _sharesAmount;
        totalSharesPosition = newTotalShares;

        shares[_account] = accountShares - _sharesAmount;

        uint256 postRebaseTokenAmount = convertToRebasing(_sharesAmount);

        emit SharesBurnt(_account, preRebaseTokenAmount, postRebaseTokenAmount, _sharesAmount);

        // Notice: we're not emitting a Transfer event to the zero address here since shares burn
        // works by redistributing the amount of tokens corresponding to the burned shares between
        // all other token holders. The total supply of the token doesn't change as the result.
        // This is equivalent to performing a send from `address` to each other token holder address,
        // but we cannot reflect this as it would require sending an unbounded number of events.

        // We're emitting `SharesBurnt` event to provide an explicit rebase log record nonetheless.
    }

    /**
     * @dev Emits {Transfer} and {TransferShares} events
     */
    function _emitTransferEvents(address _from, address _to, uint _tokenAmount, uint256 _sharesAmount) internal {
        emit Transfer(_from, _to, _tokenAmount);
        emit TransferShares(_from, _to, _sharesAmount);
    }

    /**
     * @dev Emits {Transfer} and {TransferShares} events where `from` is 0 address. Indicates mint events.
     */
    function _emitTransferAfterMintingShares(address _to, uint256 _sharesAmount) internal {
        _emitTransferEvents(address(0), _to, convertToRebasing(_sharesAmount), _sharesAmount);
    }

    /**
     * @dev Mints shares to INITIAL_TOKEN_HOLDER
     */
    function _mintInitialShares(uint256 _sharesAmount) internal {
        _mintShares(INITIAL_TOKEN_HOLDER, _sharesAmount);
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
    function _bootstrapInitialHolder() internal {
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