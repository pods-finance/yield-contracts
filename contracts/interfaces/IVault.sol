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

    function getName() external view returns(string memory);

    function deposit(uint amount) external;

    function withdraw() external;
}
