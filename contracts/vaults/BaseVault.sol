// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IVault.sol";
import "../libs/CastUint.sol";
import "../mixins/Capped.sol";
import "hardhat/console.sol";

/**
 * @title A Vault that tokenize shares of strategy
 * @author Pods Finance
 */
abstract contract BaseVault is IVault, ERC20Permit, ERC4626, Capped {
    using SafeERC20 for IERC20Metadata;
    using Math for uint256;
    using CastUint for uint256;
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    IConfigurationManager public immutable configuration;

    uint256 public currentRoundId;
    bool public isProcessingDeposits = false;

    /*
    DENOMINATOR represents the precision for the following system variables:
    - MAX_WITHDRAW_FEE
    - InvestorRatio
    */

    uint256 public constant DENOMINATOR = 10000;
    /*
    MAX_WITHDRAW_FEE is a safe check in case the ConfiguratorManager sets
    a fee high enough that can be used as a way to drain funds.
    The precision of this number is set by constant DENOMINATOR.
    */
    uint256 public constant MAX_WITHDRAW_FEE = 1000;
    uint256 public constant EMERGENCY_INTERVAL = 604800;
    uint256 public processedDeposits = 0;
    uint256 internal _totalIdleAssets = 0;
    uint256 private _lastEndRound;

    EnumerableMap.AddressToUintMap internal depositQueue;

    constructor(IConfigurationManager $configuration, IERC20Metadata $asset)
        ERC20(string(abi.encodePacked("Pods Yield ", $asset.symbol())), string(abi.encodePacked("py", $asset.symbol())))
        ERC20Permit(string(abi.encodePacked("Pods Yield ", $asset.symbol())))
        ERC4626($asset)
        Capped($configuration)
    {
        configuration = $configuration;

        // Vault starts in `start` state
        emit StartRound(currentRoundId, 0);
        _lastEndRound = block.timestamp;
    }

    modifier onlyController() {
        if (msg.sender != controller()) revert IVault__CallerIsNotTheController();
        _;
    }

    modifier onlyRoundStarter() {
        bool lastRoundEndedAWeekAgo = block.timestamp >= _lastEndRound + EMERGENCY_INTERVAL;

        if (!lastRoundEndedAWeekAgo && msg.sender != controller()) {
            revert IVault__CallerIsNotTheController();
        }
        _;
    }

    modifier whenNotProcessingDeposits() {
        if (isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();
        _;
    }

    /**
     * @inheritdoc IERC4626
     */
    function deposit(uint256 assets, address receiver)
        public
        virtual
        override(ERC4626, IERC4626)
        whenNotProcessingDeposits
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public whenNotProcessingDeposits returns (uint256 shares) {
        IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s);
        return super.deposit(assets, receiver);
    }

    /**
     * @inheritdoc IERC4626
     */
    function mint(uint256 shares, address receiver)
        public
        virtual
        override(ERC4626, IERC4626)
        whenNotProcessingDeposits
        returns (uint256 assets)
    {
        return super.mint(shares, receiver);
    }

    function mintWithPermit(
        uint256 shares,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public whenNotProcessingDeposits returns (uint256 assets) {
        assets = previewMint(shares);
        IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s);
        return super.mint(shares, receiver);
    }

    /**
     * @inheritdoc IERC4626
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override(ERC4626, IERC4626) whenNotProcessingDeposits returns (uint256 assets) {
        assets = convertToAssets(shares);

        if (assets == 0) revert IVault__ZeroAssets();
        (assets, ) = _withdrawWithFees(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @inheritdoc IERC4626
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override(ERC4626, IERC4626) whenNotProcessingDeposits returns (uint256 shares) {
        shares = convertToShares(assets);
        (, shares) = _withdrawWithFees(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewWithdraw(uint256 assets) public view override(ERC4626, IERC4626) returns (uint256 shares) {
        shares = _convertToShares(assets, Math.Rounding.Up);
        uint256 invertedFee = DENOMINATOR - withdrawFeeRatio();
        return shares.mulDiv(DENOMINATOR, invertedFee, Math.Rounding.Up);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewRedeem(uint256 shares) public view override(ERC4626, IERC4626) returns (uint256 assets) {
        assets = _convertToAssets(shares, Math.Rounding.Down);
        return assets - _getFee(assets);
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxWithdraw(address owner) public view override(ERC4626, IERC4626) returns (uint256 assets) {
        return previewRedeem(balanceOf(owner));
    }

    /**
     * @inheritdoc IVault
     */
    function withdrawFeeRatio() public view override returns (uint256) {
        uint256 _withdrawFeeRatio = configuration.getParameter(address(this), "WITHDRAW_FEE_RATIO");
        // Fee is limited to MAX_WITHDRAW_FEE
        return Math.min(_withdrawFeeRatio, MAX_WITHDRAW_FEE);
    }

    /**
     * @inheritdoc IVault
     */
    function idleAssetsOf(address owner) public view virtual returns (uint256) {
        (, uint256 assets) = depositQueue.tryGet(owner);
        return assets;
    }

    /**
     * @inheritdoc IVault
     */
    function assetsOf(address owner) public view virtual returns (uint256) {
        uint256 supply = totalSupply();
        uint256 shares = balanceOf(owner);
        uint256 committedAssets = supply == 0
            ? 0
            : shares.mulDiv(IERC20Metadata(asset()).balanceOf(address(this)), supply, Math.Rounding.Down);
        return convertToAssets(shares) + idleAssetsOf(owner) + committedAssets;
    }

    /**
     * @inheritdoc IVault
     */
    function totalIdleAssets() public view virtual returns (uint256) {
        return _totalIdleAssets;
    }

    /**
     * @inheritdoc IVault
     */
    function depositQueueSize() public view returns (uint256) {
        return depositQueue.length();
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
    function startRound() external virtual onlyRoundStarter returns (uint256 roundId) {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        isProcessingDeposits = false;

        _afterRoundStart(processedDeposits);
        emit StartRound(currentRoundId, processedDeposits);
        processedDeposits = 0;

        return currentRoundId;
    }

    /**
     * @inheritdoc IVault
     */
    function endRound() external virtual onlyController {
        if (isProcessingDeposits) revert IVault__AlreadyProcessingDeposits();

        isProcessingDeposits = true;
        _afterRoundEnd();
        _lastEndRound = block.timestamp;

        emit EndRound(currentRoundId++);
    }

    /**
     * @inheritdoc IVault
     */
    function refund() external returns (uint256 assets) {
        (, assets) = depositQueue.tryGet(msg.sender);
        if (assets == 0) revert IVault__ZeroAssets();

        if (depositQueue.remove(msg.sender)) {
            _totalIdleAssets -= assets;
        }

        emit DepositRefunded(msg.sender, currentRoundId, assets);
        IERC20Metadata(asset()).safeTransfer(msg.sender, assets);
    }

    /**
     * @inheritdoc IVault
     */
    function migrate(IVault newVault) external override {
        if (asset() != newVault.asset() || !configuration.isVaultAllowed(address(newVault))) {
            revert IVault__MigrationNotAllowed();
        }

        // Redeem owner assets from this Vault
        uint256 shares = balanceOf(msg.sender);
        uint256 assets = redeem(shares, address(this), msg.sender);

        // Deposit assets to `newVault`
        IERC20Metadata(asset()).safeApprove(address(newVault), assets);
        newVault.deposit(assets, msg.sender);

        emit Migrated(msg.sender, address(this), address(newVault), assets, shares);
    }

    /**
     * @inheritdoc IVault
     */
    function processQueuedDeposits(address[] calldata depositors) external {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        uint256 _totalAssets = totalAssets();
        for (uint256 i = 0; i < depositors.length; i++) {
            if (depositQueue.contains(depositors[i])) {
                uint256 currentAssets = _totalAssets + processedDeposits;
                processedDeposits += _processDeposit(depositors[i], currentAssets);
            }
        }
    }

    /** Internals **/

    /**
     * @notice Mint new shares, effectively representing user participation in the Vault.
     */
    function _processDeposit(address depositor, uint256 currentAssets) internal virtual returns (uint256) {
        uint256 supply = totalSupply();
        uint256 assets = depositQueue.get(depositor);
        uint256 shares = currentAssets == 0 || supply == 0
            ? assets
            : assets.mulDiv(supply, currentAssets, Math.Rounding.Up);
        depositQueue.remove(depositor);
        _totalIdleAssets -= assets;
        _mint(depositor, shares);
        emit DepositProcessed(depositor, currentRoundId, assets, shares);

        return assets;
    }

    /**
     * @notice Add a new entry to the deposit to queue
     */
    function _addToDepositQueue(address receiver, uint256 assets) internal {
        (, uint256 previous) = depositQueue.tryGet(receiver);
        _totalIdleAssets += assets;
        depositQueue.set(receiver, previous + assets);
    }

    /**
     * @notice Calculate the fee amount on withdraw.
     */
    function _getFee(uint256 assets) internal view returns (uint256) {
        return assets.mulDiv(withdrawFeeRatio(), DENOMINATOR, Math.Rounding.Down);
    }

    /**
     * @dev Pull assets from the caller and create shares to the receiver
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        IERC20Metadata(asset()).safeTransferFrom(caller, address(this), assets);

        _spendCap(shares);
        _addToDepositQueue(receiver, assets);
        emit Deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Burn shares from the caller and release assets to the receiver
     */
    function _withdrawWithFees(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual returns (uint256 receiverAssets, uint256 receiverShares) {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        _burn(owner, shares);
        _restoreCap(shares);

        // Apply custom withdraw logic
        _beforeWithdraw(shares, assets);

        uint256 fee = _getFee(assets);
        receiverAssets = assets - fee;
        receiverShares = shares;

        emit Withdraw(caller, receiver, owner, receiverAssets, shares);
        IERC20Metadata(asset()).safeTransfer(receiver, receiverAssets);

        if (fee > 0) {
            emit FeeCollected(fee);
            IERC20Metadata(asset()).safeTransfer(controller(), fee);
        }
    }

    /** Hooks **/

    // solhint-disable-next-line no-empty-blocks
    /* This hook should be implemented in the contract implementation.
        It will trigger after the shares were burned
    */
    function _beforeWithdraw(uint256 shares, uint256 assets) internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    /* This hook should be implemented in the contract implementation.
        It will trigger after setting isProcessingDeposits to false
    */
    function _afterRoundStart(uint256 assets) internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    /* This hook should be implemented in the contract implementation.
        It will trigger after setting isProcessingDeposits to true
    */
    function _afterRoundEnd() internal virtual {}
}
