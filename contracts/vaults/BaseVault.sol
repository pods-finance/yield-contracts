// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IVault.sol";
import "../libs/FixedPointMath.sol";
import "../libs/DepositQueueLib.sol";
import "../libs/CastUint.sol";
import "../mixins/Capped.sol";

/**
 * @title A Vault that tokenize shares of strategy
 * @author Pods Finance
 */
abstract contract BaseVault is IVault, ERC20Permit, Capped {
    using SafeERC20 for IERC20Metadata;
    using FixedPointMath for uint256;
    using CastUint for uint256;
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    IConfigurationManager public immutable configuration;
    IERC20Metadata internal immutable _asset;

    uint256 public currentRoundId;
    bool public isProcessingDeposits = false;

    uint256 public constant DENOMINATOR = 10000;
    uint256 public constant MAX_WITHDRAW_FEE = 1000;
    uint256 public processedDeposits = 0;

    DepositQueueLib.DepositQueue internal depositQueue;

    constructor(IConfigurationManager _configuration, IERC20Metadata _asset_)
        ERC20(
            string(abi.encodePacked("Pods Yield ", _asset_.symbol())),
            string(abi.encodePacked("py", _asset_.symbol()))
        )
        ERC20Permit(string(abi.encodePacked("Pods Yield ", _asset_.symbol())))
        Capped(_configuration)
    {
        configuration = _configuration;
        _asset = _asset_;

        // Vault starts in `start` state
        emit StartRound(currentRoundId, 0);
    }

    modifier onlyController() {
        if (msg.sender != controller()) revert IVault__CallerIsNotTheController();
        _;
    }

    /**
     * @inheritdoc ERC20
     */
    function decimals() public view override returns (uint8) {
        return _asset.decimals();
    }

    /**
     * @inheritdoc IERC4626
     */
    function asset() public view returns (address) {
        return address(_asset);
    }

    /**
     * @inheritdoc IERC4626
     */
    function deposit(uint256 assets, address receiver) external virtual override returns (uint256 shares) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        shares = previewDeposit(assets);

        if (shares == 0) revert IVault__ZeroShares();
        _deposit(assets, shares, receiver);
    }

    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 shares) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        shares = previewDeposit(assets);

        if (shares == 0) revert IVault__ZeroShares();
        IERC20Permit(address(_asset)).permit(msg.sender, address(this), assets, deadline, v, r, s);
        _deposit(assets, shares, receiver);
    }

    /**
     * @inheritdoc IERC4626
     */
    function mint(uint256 shares, address receiver) external virtual override returns (uint256 assets) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        assets = previewMint(shares);
        assets = _deposit(assets, shares, receiver);
    }

    function mintWithPermit(
        uint256 shares,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256 assets) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        assets = previewMint(shares);
        IERC20Permit(address(_asset)).permit(msg.sender, address(this), assets, deadline, v, r, s);
        assets = _deposit(assets, shares, receiver);
    }

    /**
     * @inheritdoc IERC4626
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256 assets) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        assets = convertToAssets(shares);

        if (assets == 0) revert IVault__ZeroAssets();
        (assets, ) = _withdraw(assets, shares, receiver, owner);
    }

    /**
     * @inheritdoc IERC4626
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external virtual override returns (uint256 shares) {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        shares = convertToShares(assets);
        (, shares) = _withdraw(assets, shares, receiver, owner);
    }

    /**
     * @inheritdoc IERC4626
     */
    function totalAssets() public view virtual returns (uint256);

    /**
     * @inheritdoc IERC4626
     */
    function previewDeposit(uint256 assets) public view override returns (uint256 shares) {
        return convertToShares(assets);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewMint(uint256 shares) public view override returns (uint256 assets) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : shares.mulDivUp(totalAssets(), supply);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewWithdraw(uint256 assets) public view override returns (uint256 shares) {
        return convertToShares(assets - _getFee(assets));
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewRedeem(uint256 shares) public view override returns (uint256 assets) {
        assets = convertToAssets(shares);
        return assets - _getFee(assets);
    }

    /**
     * @inheritdoc IERC4626
     */
    function convertToShares(uint256 assets) public view override returns (uint256 shares) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : assets.mulDivDown(supply, totalAssets());
    }

    /**
     * @inheritdoc IERC4626
     */
    function convertToAssets(uint256 shares) public view override returns (uint256 assets) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxDeposit(address) public pure override returns (uint256 assets) {
        return type(uint256).max;
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxMint(address) public pure override returns (uint256 shares) {
        return type(uint256).max;
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxWithdraw(address owner) public view override returns (uint256 assets) {
        return previewRedeem(balanceOf(owner));
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxRedeem(address owner) public view override returns (uint256 shares) {
        return balanceOf(owner);
    }

    /**
     * @inheritdoc IVault
     */
    function withdrawFeeRatio() public view override returns (uint256) {
        uint256 _withdrawFeeRatio = configuration.getParameter(address(this), "WITHDRAW_FEE_RATIO");
        // Fee is limited to MAX_WITHDRAW_FEE
        return FixedPointMath.min(_withdrawFeeRatio, MAX_WITHDRAW_FEE);
    }

    /**
     * @inheritdoc IVault
     */
    function idleAssetsOf(address owner) public view virtual returns (uint256) {
        return depositQueue.balanceOf(owner);
    }

    /**
     * @inheritdoc IVault
     */
    function assetsOf(address owner) public view virtual returns (uint256) {
        uint256 supply = totalSupply();
        uint256 shares = balanceOf(owner);
        uint256 committedAssets = supply == 0 ? 0 : shares.mulDivDown(_asset.balanceOf(address(this)), supply);
        return convertToAssets(shares) + idleAssetsOf(owner) + committedAssets;
    }

    /**
     * @inheritdoc IVault
     */
    function totalIdleAssets() public view virtual returns (uint256) {
        return depositQueue.totalDeposited;
    }

    /**
     * @inheritdoc IVault
     */
    function depositQueueSize() public view returns (uint256) {
        return depositQueue.size();
    }

    /**
     * @inheritdoc IVault
     */
    function controller() public view returns (address) {
        return configuration.getParameter(address(this), "VAULT_CONTROLLER").toAddress();
    }

    /**
     * @inheritdoc IVault
     */
    function startRound() external virtual onlyController {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        isProcessingDeposits = false;

        _afterRoundStart(processedDeposits);
        emit StartRound(currentRoundId, processedDeposits);
        processedDeposits = 0;
    }

    /**
     * @inheritdoc IVault
     */
    function endRound() external virtual onlyController {
        if (isProcessingDeposits) revert IVault__AlreadyProcessingDeposits();

        isProcessingDeposits = true;
        _afterRoundEnd();

        emit EndRound(currentRoundId++);
    }

    /**
     * @inheritdoc IVault
     */
    function refund() external {
        uint256 assets = depositQueue.balanceOf(msg.sender);
        if (assets == 0) revert IVault__ZeroAssets();

        for (uint256 i = 0; i < depositQueue.size(); i++) {
            DepositQueueLib.DepositEntry memory depositEntry = depositQueue.get(i);
            if (depositEntry.owner == msg.sender) {
                depositQueue.remove(i, i + 1);
                break;
            }
        }

        emit DepositRefunded(msg.sender, currentRoundId, assets);
        _asset.safeTransfer(msg.sender, assets);
    }

    /**
     * @inheritdoc IVault
     */
    function migrate(IVault newVault) external override {
        if (address(_asset) != newVault.asset() || !configuration.isVaultAllowed(address(newVault))) {
            revert IVault__MigrationNotAllowed();
        }

        // Redeem owner assets from this Vault
        uint256 shares = balanceOf(msg.sender);
        uint256 assets = redeem(shares, address(this), msg.sender);

        // Deposit assets to `newVault`
        _asset.safeApprove(address(newVault), assets);
        newVault.deposit(assets, msg.sender);

        emit Migrated(msg.sender, address(this), address(newVault), assets, shares);
    }

    /**
     * @inheritdoc IVault
     */
    function processQueuedDeposits(uint256 startIndex, uint256 endIndex) external {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        uint256 _totalAssets = totalAssets();
        for (uint256 i = startIndex; i < endIndex; i++) {
            uint256 currentAssets = _totalAssets + processedDeposits;
            DepositQueueLib.DepositEntry memory depositEntry = depositQueue.get(i);
            _processDeposit(depositEntry, currentAssets);
            processedDeposits += depositEntry.amount;
        }
        depositQueue.remove(startIndex, endIndex);
    }

    /** Internals **/

    /**
     * @notice Mint new shares, effectively representing user participation in the Vault.
     */
    function _processDeposit(DepositQueueLib.DepositEntry memory depositEntry, uint256 currentAssets) internal virtual {
        uint256 supply = totalSupply();
        uint256 assets = depositEntry.amount;
        uint256 shares = currentAssets == 0 || supply == 0 ? assets : assets.mulDivUp(supply, currentAssets);
        _mint(depositEntry.owner, shares);
        emit DepositProcessed(depositEntry.owner, currentRoundId, assets, shares);
    }

    /**
     * @notice Calculate the fee amount on withdraw.
     */
    function _getFee(uint256 assets) internal view returns (uint256) {
        return (assets * withdrawFeeRatio()) / DENOMINATOR;
    }

    /**
     * @dev Pull assets from the caller and create shares to the receiver
     */
    function _deposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal virtual returns (uint256 depositedAssets) {
        _spendCap(shares);

        depositQueue.push(DepositQueueLib.DepositEntry(receiver, assets));

        emit Deposit(msg.sender, receiver, assets, shares);
        _asset.safeTransferFrom(msg.sender, address(this), assets);

        return assets;
    }

    /**
     * @dev Burn shares from the caller and release assets to the receiver
     */
    function _withdraw(
        uint256 assets,
        uint256 shares,
        address receiver,
        address owner
    ) internal virtual returns (uint256 receiverAssets, uint256 receiverShares) {
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
        emit FeeCollected(fee);

        _asset.safeTransfer(receiver, receiverAssets);
        _asset.safeTransfer(controller(), fee);
    }

    /** Hooks **/

    // solhint-disable-next-line no-empty-blocks
    function _beforeWithdraw(uint256 shares, uint256 assets) internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    function _afterRoundStart(uint256 assets) internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    function _afterRoundEnd() internal virtual {}
}
