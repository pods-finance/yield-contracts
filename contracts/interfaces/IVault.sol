//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    error CallerHasNotEnoughShares();
    error WithdrawNotAllowed();
    error WithdrawNotAvailable();
    error NotInWithdrawWindow();
    error CallerIsNotTheStrategist();

    event Deposit(address indexed owner, uint shareAmount, uint underlyingAmount);
    event WithdrawRequest(address indexed owner, uint roundId);
    event Withdraw(address indexed owner, uint shareAmount, uint underlyingAmount);
    event PrepareRound(uint indexed roundId, uint amount);
    event CloseRound(uint indexed roundId, uint amountYielded);

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
