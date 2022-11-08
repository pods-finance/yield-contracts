// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import "./BaseVault.sol";

/**
 * @title STETHVault
 * @notice A Vault that use variable weekly yields to buy strangles
 * @author Pods Finance
 */
contract STETHVault is BaseVault {
    using SafeERC20 for IERC20Metadata;
    using Math for uint256;

    /**
     * @dev INVESTOR_RATIO is the proportion that the weekly yield will be split
     * The precision of this number is set by the variable DENOMINATOR. 5000 is equivalent to 50%
     */
    uint256 public constant INVESTOR_RATIO = 5000;
    address public immutable investor;
    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    Fractional public lastSharePrice;

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
    )
        BaseVault(
            _configuration,
            _asset,
            string(abi.encodePacked(_asset.symbol(), " Volatility Vault")),
            string(abi.encodePacked(_asset.symbol(), "vv"))
        )
    {
        investor = _investor;
        sharePriceDecimals = _asset.decimals();
    }

    /**
     * @inheritdoc IERC4626
     */
    function totalAssets() public view override(ERC4626, IERC4626) returns (uint256) {
        return IERC20Metadata(asset()).balanceOf(address(this)) - totalIdleAssets();
    }

    /**
     * @inheritdoc BaseVault
     */
    function _afterRoundStart() internal override {
        uint256 supply = totalSupply();

        lastRoundAssets = totalAssets();
        lastSharePrice = Fractional({ numerator: supply == 0 ? 0 : lastRoundAssets, denominator: supply });

        uint256 sharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);
        emit StartRoundData(vaultState.currentRoundId, lastRoundAssets, sharePrice);
    }

    /**
     * @inheritdoc BaseVault
     */
    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest = 0;
        uint256 endSharePrice = 0;
        uint256 investmentYield = IERC20Metadata(asset()).balanceOf(investor);
        uint256 supply = totalSupply();

        if (supply != 0) {
            roundAccruedInterest = totalAssets() - lastRoundAssets;
            uint256 investmentAmount = (roundAccruedInterest * INVESTOR_RATIO) / DENOMINATOR;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                IERC20Metadata(asset()).safeTransferFrom(investor, address(this), investmentYield);
            }

            if (investmentAmount > 0) {
                IERC20Metadata(asset()).safeTransfer(investor, investmentAmount);
            }

            // End Share price needs to be calculated after the transfers between investor and vault
            endSharePrice = (totalAssets()).mulDiv(10**sharePriceDecimals, supply, Math.Rounding.Down);
        }

        uint256 startSharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.numerator.mulDiv(10**sharePriceDecimals, lastSharePrice.denominator, Math.Rounding.Down);

        emit EndRoundData(vaultState.currentRoundId, roundAccruedInterest, investmentYield, totalIdleAssets());
        emit SharePrice(vaultState.currentRoundId, startSharePrice, endSharePrice);
    }

    /**
     * @inheritdoc BaseVault
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        assets = _stETHTransferFrom(caller, address(this), assets);
        shares = previewDeposit(assets);

        _spendCap(shares);
        _addToDepositQueue(receiver, assets);
        emit Deposit(caller, receiver, assets, shares);
    }

    /**
     * @inheritdoc BaseVault
     */
    function _withdrawWithFees(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override returns (uint256 receiverAssets, uint256 receiverShares) {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        _burn(owner, shares);
        _restoreCap(shares);

        lastRoundAssets -= shares.mulDiv(lastSharePrice.numerator, lastSharePrice.denominator, Math.Rounding.Down);

        uint256 fee = _getFee(assets);
        receiverAssets = assets - fee;
        receiverShares = shares;

        emit Withdraw(caller, receiver, owner, receiverAssets, shares);
        receiverAssets = _stETHTransferFrom(address(this), receiver, receiverAssets);

        if (fee > 0) {
            emit FeeCollected(fee);
            _stETHTransferFrom(address(this), controller(), fee);
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
    ) internal returns (uint256) {
        uint256 balanceBefore = IERC20Metadata(asset()).balanceOf(to);
        if (from == address(this)) {
            IERC20Metadata(asset()).safeTransfer(to, amount);
        } else {
            IERC20Metadata(asset()).safeTransferFrom(from, to, amount);
        }
        return IERC20Metadata(asset()).balanceOf(to) - balanceBefore;
    }
}
