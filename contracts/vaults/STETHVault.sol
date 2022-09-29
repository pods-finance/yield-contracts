// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "./BaseVault.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract STETHVault is BaseVault {
    using SafeERC20 for IERC20Metadata;
    using Math for uint256;
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    Fractional public lastSharePrice;

    /*
     @dev investorRatio is the proportion that the weekly yield will be splitted
     The precision of this number is set by the variable DENOMINATOR. 5000 is equivalent to 50%
    */
    uint256 public constant investorRatio = 5000;
    address public immutable investor;

    event StartRoundData(uint256 indexed roundId, uint256 lastRoundAssets, uint256 sharePrice);
    event EndRoundData(
        uint256 indexed roundId,
        uint256 roundAccruedInterest,
        uint256 investmentYield,
        uint256 idleAssets
    );
    event SharePrice(uint256 indexed roundId, uint256 startSharePrice, uint256 endSharePrice);

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor
    ) BaseVault(_configuration, _asset) {
        investor = _investor;
        sharePriceDecimals = _asset.decimals();
    }

    /**
     * @inheritdoc ERC20
     */
    function name() public view override returns (string memory) {
        return string(abi.encodePacked(_asset.symbol(), " Volatility Vault"));
    }

    /**
     * @inheritdoc ERC20
     */
    function symbol() public view override returns (string memory) {
        return string(abi.encodePacked(_asset.symbol(), "vv"));
    }

    function _afterRoundStart(uint256) internal override {
        uint256 supply = totalSupply();

        lastRoundAssets = totalAssets();
        lastSharePrice = Fractional({ numerator: supply == 0 ? 0 : lastRoundAssets, denominator: supply });

        uint256 sharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);
        emit StartRoundData(currentRoundId, lastRoundAssets, sharePrice);
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest = 0;
        uint256 endSharePrice = 0;
        uint256 investmentYield = _asset.balanceOf(investor);
        uint256 supply = totalSupply();

        if (supply != 0) {
            roundAccruedInterest = totalAssets() - lastRoundAssets;
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                _asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            if (investmentAmount > 0) {
                _asset.safeTransfer(investor, investmentAmount);
            }

            // End Share price needs to be calculated after the transfers between investor and vault
            endSharePrice = (totalAssets()).mulDiv(10**sharePriceDecimals, supply, Math.Rounding.Down);
        }

        uint256 startSharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);

        emit EndRoundData(currentRoundId, roundAccruedInterest, investmentYield, totalIdleAssets());
        emit SharePrice(currentRoundId, startSharePrice, endSharePrice);
    }

    function _beforeWithdraw(uint256 shares, uint256) internal override {
        lastRoundAssets -= shares.mulDiv(lastSharePrice.numerator, lastSharePrice.denominator, Math.Rounding.Down);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return _asset.balanceOf(address(this)) - totalIdleAssets();
    }

    /**
     * @dev Pull assets from the caller and create shares to the receiver
     */
    function _deposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal override returns (uint256 depositedAssets) {
        _spendCap(shares);

        assets = _stETHTransferFrom(msg.sender, address(this), assets);
        depositQueue.push(DepositQueueLib.DepositEntry(receiver, assets));

        emit Deposit(msg.sender, receiver, assets, shares);

        return assets;
    }

    function _withdraw(
        uint256 assets,
        uint256 shares,
        address receiver,
        address owner
    ) internal virtual override returns (uint256 receiverAssets, uint256 receiverShares) {
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);
        _restoreCap(shares);

        // Apply custom withdraw logic
        _beforeWithdraw(shares, assets);

        uint256 fee = _getFee(assets);
        receiverAssets = assets - fee;
        receiverShares = shares;

        emit Withdraw(msg.sender, receiver, owner, receiverAssets, shares);

        _asset.safeTransfer(receiver, receiverAssets);

        if (fee > 0) {
            emit FeeCollected(fee);
            _asset.safeTransfer(controller(), fee);
        }
    }

    /**
     * @dev Moves `amount` of stETH from `from` to `to` using the
     * allowance mechanism.
     *
     * Note that due to division rounding, not always is not possible to move
     * the entire amount, hence transfer is attempted, returning the
     * `effectiveAmount` transferred.
     *
     * For more information refer to: https://docs.lido.fi/guides/steth-integration-guide#1-wei-corner-case
     */
    function _stETHTransferFrom(
        address from,
        address to,
        uint256 amount
    ) internal returns (uint256 effectiveAmount) {
        uint256 balanceBefore = _asset.balanceOf(to);
        if (from == address(this)) {
            _asset.safeTransfer(to, amount);
        } else {
            _asset.safeTransferFrom(from, to, amount);
        }
        return _asset.balanceOf(to) - balanceBefore;
    }
}
