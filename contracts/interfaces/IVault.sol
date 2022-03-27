//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    error CallerHasNotEnoughShares();
    error ClaimNotAllowed();
    error ClaimNotAvailable();
    error NotInClaimWindow();

    event Stake(address indexed owner, uint shareAmount, uint underlyingAmount);
    event ClaimRequested(address indexed owner, uint roundId);
    event Claim(address indexed owner, uint shareAmount, uint underlyingAmount);

    function stake(uint amount) external;

    function claim() external;
}
