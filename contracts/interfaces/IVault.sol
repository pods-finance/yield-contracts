// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface IVault is IERC4626, IERC20Permit {
    error IVault__CallerIsNotTheController();
    error IVault__NotProcessingDeposits();
    error IVault__AlreadyProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();
    error IVault__ZeroAssets();
    error IVault__MigrationNotAllowed();

    event FeeCollected(uint256 fee);
    event StartRound(uint256 indexed roundId, uint256 amountAddedToStrategy);
    event EndRound(uint256 indexed roundId);
    event DepositProcessed(address indexed owner, uint256 indexed roundId, uint256 assets, uint256 shares);
    event DepositRefunded(address indexed owner, uint256 indexed roundId, uint256 assets);
    event Migrated(address indexed caller, address indexed from, address indexed to, uint256 assets, uint256 shares);

    struct Fractional {
        uint256 numerator;
        uint256 denominator;
    }

    /**
     * @notice Returns the fee charged on withdraws.
     */
    function withdrawFeeRatio() external view returns (uint256);

    /**
     * @notice Returns the vault controller
     */
    function controller() external view returns (address);

    /**
     * @notice Outputs the amount of asset tokens of an `owner` is idle, waiting for the next round.
     */
    function idleAssetsOf(address owner) external view returns (uint256);

    /**
     * @notice Outputs the amount of asset tokens of an `owner` are either waiting for the next round,
     * deposited or committed.
     */
    function assetsOf(address owner) external view returns (uint256);

    /**
     * @notice Outputs the amount of asset tokens is idle, waiting for the next round.
     */
    function totalIdleAssets() external view returns (uint256);

    /**
     * @notice Outputs current size of the deposit queue.
     */
    function depositQueueSize() external view returns (uint256);

    /**
     * @notice Starts the next round, sending the idle funds to the
     * strategy where it should start accruing yield.
     */
    function startRound() external returns (uint256 roundId);

    /**
     * @notice Closes the round, allowing deposits to the next round be processed.
     * and opens the window for withdraws.
     */
    function endRound() external;

    /**
     * @notice Withdraw all user assets in unprocessed deposits.
     */
    function refund() external returns (uint256 assets);

    /**
     * @notice Migrate assets from this vault to `newVault`.
     */
    function migrate(IVault newVault) external;

    /**
     * @notice Mint shares for deposits accumulated, effectively including their owners in the next round.
     *
     * @param depositors Array of owner addresses to process
     */
    function processQueuedDeposits(address[] calldata depositors) external;
}
