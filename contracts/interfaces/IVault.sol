//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./IERC4626.sol";

interface IVault is IERC4626 {
    error IVault__CallerIsNotTheController();
    error IVault__NotProcessingDeposits();
    error IVault__AlreadyProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();
    error IVault__ZeroShares();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);
    event DepositProcessed(address indexed owner, uint indexed roundId, uint assets, uint shares);

    /**
     * @dev Returns the fee charged on withdraws.
     */
    function withdrawFeeRatio() external view returns(uint256);

    /**
     * @dev Returns the vault controller
     */
    function controller() external view returns(address);

    /**
     * @dev Burn shares, withdrawing asset tokens.
     */
    function withdraw(address owner) external;
}
