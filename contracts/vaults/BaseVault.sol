//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IVault.sol";
import "../libs/TransferUtils.sol";
import "../libs/FixedPointMath.sol";
import "../libs/DepositQueueLib.sol";

/**
 * @title A Vault that tokenize shares of strategy
 * @author Pods Finance
 */
contract BaseVault is IVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    IERC20Metadata public immutable asset;

    address public strategist;

    uint256 public currentRoundId;
    mapping(address => uint256) userRounds;

    mapping(address => uint256) userShares;
    uint256 public totalShares;

    bool public isProcessingDeposits = false;

    DepositQueueLib.DepositQueue private depositQueue;

    mapping(address => mapping(address => uint256)) private _allowances;

    constructor(address _asset, address _strategist) {
        asset = IERC20Metadata(_asset);
        strategist = _strategist;

        // Vault starts in `start` state
        emit StartRound(currentRoundId, 0);
    }

    /** Depositor **/

    /**
     * @dev See {IVault-deposit}.
     */
    function deposit(uint256 assets, address receiver) public virtual override {
        if(isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();

        asset.safeTransferFrom(msg.sender, address(this), assets);
        depositQueue.push(DepositQueueLib.DepositEntry(receiver, assets));

        emit Deposit(receiver, assets);
    }

    /**
     * @dev See {IVault-withdraw}.
     */
    function withdraw(address owner) public virtual override {
        if(isProcessingDeposits) revert IVault__ForbiddenWhileProcessingDeposits();

        uint256 shares = sharesOf(owner);
        uint256 assets = _burnShares(owner, shares);

        if (msg.sender != owner) {
            _useAllowance(owner, msg.sender, shares);
        }

        // Apply custom withdraw logic
        _beforeWithdraw(shares, assets);

        asset.safeTransfer(owner, assets);

        emit Withdraw(owner, shares, assets);
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external virtual override pure returns(string memory) {
        return "Base Vault";
    }

    /**
     * @dev See {IVault-allowance}.
     */
    function allowance(address owner, address spender) public view returns(uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IVault-approve}.
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert IVault__ApprovalToAddressZero();

        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @dev Outputs the amount of shares and the locked shares for a given `owner` address.
     */
    function sharesOf(address owner) public virtual view returns (uint) {
        return userShares[owner];
    }

    /**
     * @dev Outputs the amount of shares that would be generated by depositing `assets`.
     */
    function previewShares(uint256 assets) public virtual view returns (uint256) {
        uint256 shares;

        if (totalShares > 0) {
            shares = assets.mulDivUp(totalShares, totalAssets());
        }

        return shares;
    }

    /**
     * @dev Outputs the amount of underlying tokens would be withdrawn with a given amount of shares.
     */
    function previewWithdraw(uint256 shares) public virtual view returns (uint256) {
        return shares.mulDivDown(totalAssets(), totalShares);
    }

    /**
     * @dev Outputs the amount of underlying tokens of an `owner` is idle, waiting for the next round.
     */
    function idleAmountOf(address owner) public virtual view returns(uint256) {
        return depositQueue.balanceOf(owner);
    }

    /**
     * @dev Outputs current size of the deposit queue.
     */
    function depositQueueSize() external view returns(uint256) {
        return depositQueue.size();
    }

    /** Strategist **/

    modifier onlyStrategist() {
        if (msg.sender != strategist) revert IVault__CallerIsNotTheStrategist();
        _;
    }

    /**
     * @dev Starts the next round, sending the idle funds to the
     * strategist where it should start accruing yield.
     */
    function startRound() public virtual onlyStrategist {
        isProcessingDeposits = false;

        uint256 idleBalance = asset.balanceOf(address(this));
        _afterRoundStart(idleBalance);

        emit StartRound(currentRoundId, idleBalance);
    }

    /**
     * @dev Closes the round, allowing deposits to the next round be processed.
     * and opens the window for withdraws.
     */
    function endRound() public virtual onlyStrategist {
        isProcessingDeposits = true;
        _afterRoundEnd();

        emit EndRound(currentRoundId++);
    }

    /**
     * @dev Mint shares for deposits accumulated, effectively including their owners in the next round.
     * `processQueuedDeposits` extracts up to but not including endIndex. For example, processQueuedDeposits(1,4)
     * extracts the second element through the fourth element (elements indexed 1, 2, and 3).
     *
     * @param startIndex Zero-based index at which to start processing deposits
     * @param endIndex The index of the first element to exclude from queue
     */
    function processQueuedDeposits(uint startIndex, uint endIndex) public {
        if (!isProcessingDeposits) revert IVault__NotProcessingDeposits();

        uint processedDeposits;
        for(uint i = startIndex; i < endIndex; i++) {
            DepositQueueLib.DepositEntry memory depositEntry = depositQueue.get(i);
            uint shares = _mintShares(depositEntry.owner, depositEntry.amount, processedDeposits);
            processedDeposits += depositEntry.amount;
            emit DepositProcessed(depositEntry.owner, currentRoundId, depositEntry.amount, shares);
        }
        depositQueue.remove(startIndex, endIndex);
    }

    /** Internals **/

    /**
     * @dev Calculate the total amount of assets under management.
     */
    function totalAssets() public virtual view returns(uint) {
        return asset.balanceOf(strategist);
    }

    /**
     * @dev Mint new shares, effectively representing user participation in the Vault.
     */
    function _mintShares(address owner, uint256 assets, uint256 processedDeposits) internal virtual returns(uint256 shares) {
        shares = assets;
        processedDeposits += totalAssets();

        if (totalShares > 0) {
            shares = assets.mulDivUp(totalShares, processedDeposits);
        }

        userShares[owner] += shares;
        totalShares += shares;
    }

    /**
     * @dev Burn shares.
     * @param owner Address owner of the shares
     * @param shares Amount of shares to lock
     */
    function _burnShares(address owner, uint256 shares) internal virtual returns(uint claimableUnderlying) {
        if (shares > userShares[owner]) revert IVault__CallerHasNotEnoughShares();
        claimableUnderlying = userShares[owner].mulDivDown(totalAssets(), totalShares);
        userShares[owner] -= shares;
        totalShares -= shares;
    }

    /**
     * @dev Spend allowance on behalf of the shares owner.
     * @param owner Address owner of the shares
     * @param spender Address shares spender
     * @param shares Amount of shares to spend
     */
    function _useAllowance(address owner, address spender, uint256 shares) internal {
        uint256 allowed = _allowances[owner][spender];
        if (shares > allowed) revert IVault__SharesExceedAllowance();

        if (allowed != type(uint256).max) {
            _allowances[owner][spender] = allowed - shares;
        }
    }

    /** Hooks **/

    // solhint-disable-next-line no-empty-blocks
    function _beforeWithdraw(uint256 shares, uint256 assets) internal virtual {}

    function _afterRoundStart(uint assets) internal virtual {
        asset.safeTransfer(strategist, assets);
    }

    // solhint-disable-next-line no-empty-blocks
    function _afterRoundEnd() internal virtual {}
}
