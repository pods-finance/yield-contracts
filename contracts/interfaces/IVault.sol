//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IVault is IERC20Metadata {
    error IVault__CallerIsNotTheStrategist();
    error IVault__NotProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();

    event Deposit(address indexed owner, uint256 amountDeposited);
    event Withdraw(address indexed owner, uint256 sharesBurnt, uint256 amountWithdrawn);
    event StartRound(uint256 indexed roundId, uint256 amountAddedToStrategy);
    event EndRound(uint256 indexed roundId);
    event DepositProcessed(address indexed owner, uint256 indexed roundId, uint256 assets, uint256 shares);

    /**
     * @dev Deposits underlying tokens, generating shares.
     * @param amount The amount of underlying tokens to deposit
     */
    function deposit(uint256 amount) external;

    /**
     * @dev Burn shares, withdrawing underlying tokens.
     */
    function withdraw() external;
}
