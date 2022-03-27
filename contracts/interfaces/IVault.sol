//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    error CallerHasNotEnoughShares();
    error WithdrawNotAllowed();
    error WithdrawNotAvailable();
    error NotInWithdrawWindow();

    event Deposit(address indexed owner, uint shareAmount, uint underlyingAmount);
    event WithdrawRequest(address indexed owner, uint roundId);
    event Withdraw(address indexed owner, uint shareAmount, uint underlyingAmount);

    function deposit(uint amount) external;

    function withdraw() external;
}
