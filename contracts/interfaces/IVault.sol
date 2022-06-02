//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IVault is IERC20Metadata {
    error IVault__CallerIsNotTheStrategist();
    error IVault__NotProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);
    event DepositProcessed(address indexed owner, uint indexed roundId, uint assets, uint shares);

    /**
     * @dev Deposits asset tokens, generating shares.
     * @param assets The amount of asset token to deposit
     * @param receiver The address to be owner of the shares
     */
    function deposit(uint256 assets, address receiver) external;

    /**
     * @dev Burn shares, withdrawing asset tokens.
     */
    function withdraw(address owner) external;
}
