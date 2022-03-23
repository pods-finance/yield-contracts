//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    event Stake(address indexed owner, uint shareAmount, uint underlyingAmount);
    event Claim(address indexed owner, uint shareAmount, uint underlyingAmount);

    error CallerHasNoShares();

    function stake(uint amount) external;

    function claim() external;
}
