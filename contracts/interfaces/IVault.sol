//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    error IVault__CallerHasNotEnoughShares();
    error IVault__CallerIsNotTheStrategist();
    error IVault__NotProcessingDeposits();
    error IVault__ForbiddenDuringProcessDeposits();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);

    /**
     * @dev Returns the name of the Vault.
     */
    function name() external view returns(string memory);

    /**
     * @dev Deposits underlying tokens, generating shares.
     * @param amount The amount of underlying tokens to deposit
     */
    function deposit(uint amount) external;

    /**
     * @dev Burn shares, withdrawing underlying tokens.
     */
    function withdraw() external;
}
