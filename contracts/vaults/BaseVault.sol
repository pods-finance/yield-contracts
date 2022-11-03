// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

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
    MAX_WITHDRAW_FEE is a safe check in case the ConfigurationManager sets
    a fee high enough that can be used as a way to drain funds.
    The precision of this number is set by constant DENOMINATOR.
    */
    uint256 public constant MAX_WITHDRAW_FEE = 1000;
    /**
     * @notice Minimum asset amount for the first deposit
     * @dev This amount that prevents the first depositor to steal funds from subsequent depositors.
     * See https://code4rena.com/reports/2022-01-sherlock/#h-01-first-user-can-steal-everyone-elses-tokens
     */
    uint256 public immutable MIN_INITIAL_ASSETS;

    uint256 public processedDeposits = 0;
    uint256 internal _totalIdleAssets = 0;
    uint256 private _lastEndRound;

    EnumerableMap.AddressToUintMap internal depositQueue;

    constructor(
        IConfigurationManager configuration_,
        IERC20Metadata asset_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC20Permit(name_) ERC4626(asset_) Capped(configuration_) {
        configuration = configuration_;

        // Vault starts in `start` state
        emit RoundStarted(currentRoundId, 0);
        _lastEndRound = block.timestamp;

        MIN_INITIAL_ASSETS = 10**uint256(asset_.decimals());
    }

    modifier onlyController() {
        if (msg.sender != controller()) revert IVault__CallerIsNotTheController();
        _;
    }

    modifier onlyRoundStarter() {
        bool lastRoundEndedAWeekAgo = block.timestamp >= _lastEndRound + 1 weeks;

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
        returns (uint256)
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
    ) external whenNotProcessingDeposits returns (uint256) {
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
        returns (uint256)
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
    ) external whenNotProcessingDeposits returns (uint256) {
        uint256 assets = previewMint(shares);
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
        shares = _convertToShares(assets, Math.Rounding.Up);
        (, shares) = _withdrawWithFees(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewWithdraw(uint256 assets) public view override(ERC4626, IERC4626) returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Up);
    }

    /**
     * @inheritdoc IERC4626
     */
    function previewRedeem(uint256 shares) public view override(ERC4626, IERC4626) returns (uint256) {
        uint256 assets = _convertToAssets(shares, Math.Rounding.Down);
        return assets - _getFee(assets);
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxDeposit(address) public view override(ERC4626, IERC4626) returns (uint256) {
        uint256 _availableCap = availableCap();
        if (_availableCap != type(uint256).max) {
            return previewMint(_availableCap);
        }
        return _availableCap;
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxMint(address) public view override(ERC4626, IERC4626) returns (uint256) {
        return availableCap();
    }

    /**
     * @inheritdoc IERC4626
     */
    function maxWithdraw(address owner) public view override(ERC4626, IERC4626) returns (uint256) {
        return previewRedeem(balanceOf(owner));
    }

    /**
     * @inheritdoc IVault
     */
    function getWithdrawFeeRatio() public view override returns (uint256) {
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
    function assetsOf(address owner) external view virtual returns (uint256) {
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
    function queuedDeposits() public view returns (address[] memory) {
        address[] memory addresses = new address[](depositQueue.length());
        for (uint256 i = 0; i < addresses.length; i++) {
            (address owner, ) = depositQueue.at(i);
            addresses[i] = owner;
        }
        return addresses;
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
    function startRound() external virtual onlyRoundStarter returns (uint256) {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        isProcessingDeposits = false;

        _afterRoundStart();
        emit RoundStarted(currentRoundId, processedDeposits);
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

        emit RoundEnded(currentRoundId++);
    }

    /**
     * @inheritdoc IVault
     */
    function refund() external returns (uint256 assets) {
        (, assets) = depositQueue.tryGet(msg.sender);
        if (assets == 0) revert IVault__ZeroAssets();

        if (depositQueue.remove(msg.sender)) {
            _totalIdleAssets -= assets;
            _restoreCap(convertToShares(assets));
        }

        emit DepositRefunded(msg.sender, currentRoundId, assets);
        IERC20Metadata(asset()).safeTransfer(msg.sender, assets);
    }

    /**
     * @inheritdoc IVault
     */
    function migrate(IVault newVault) external override {
        if (!configuration.isVaultMigrationAllowed(address(this), address(newVault))) {
            revert IVault__MigrationNotAllowed();
        }

        // Redeem owner assets from this Vault
        uint256 shares = balanceOf(msg.sender);
        uint256 assets = redeem(shares, address(this), msg.sender);

        // Deposit assets to `newVault`
        IERC20Metadata(asset()).safeApprove(address(newVault), assets);
        newVault.handleMigration(assets, msg.sender);

        emit Migrated(msg.sender, address(this), address(newVault), assets, shares);
    }

    /**
     * @inheritdoc IVault
     */
    function handleMigration(uint256 assets, address receiver) external override returns (uint256) {
        if (!configuration.isVaultMigrationAllowed(msg.sender, address(this))) {
            revert IVault__MigrationNotAllowed();
        }

        return deposit(assets, receiver);
    }

    /**
     * @inheritdoc IVault
     */
    function processQueuedDeposits(address[] calldata depositors) external {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        for (uint256 i = 0; i < depositors.length; i++) {
            if (depositQueue.contains(depositors[i])) {
                processedDeposits += _processDeposit(depositors[i]);
            }
        }
    }

    /** Internals **/

    /**
     * @notice Mint new shares, effectively representing user participation in the Vault.
     */
    function _processDeposit(address depositor) internal virtual returns (uint256) {
        uint256 currentAssets = totalAssets();
        uint256 supply = totalSupply();
        uint256 assets = depositQueue.get(depositor);
        uint256 shares = currentAssets == 0 || supply == 0
            ? assets
            : assets.mulDiv(supply, currentAssets, Math.Rounding.Down);

        if (supply == 0 && assets < MIN_INITIAL_ASSETS) {
            revert IVault__AssetsUnderMinimumAmount(assets);
        }

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
        return assets.mulDiv(getWithdrawFeeRatio(), DENOMINATOR, Math.Rounding.Down);
    }

    /**
     * @dev Pull assets from the caller and add it to the deposit queue
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
    function _afterRoundStart() internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    /* This hook should be implemented in the contract implementation.
        It will trigger after setting isProcessingDeposits to true
    */
    function _afterRoundEnd() internal virtual {}
}
