// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISTETH is IERC20 {
    function getTotalPooledEther() external view returns (uint256);

    function getSharesByPooledEth(uint256) external view returns (uint256);

    function getPooledEthByShares(uint256) external view returns (uint256);

    function submit(address) external payable returns (uint256);

    function decimals() external view returns (uint8);

    function receiveELRewards() external payable;  

    function symbol() external view returns (string memory);
}
