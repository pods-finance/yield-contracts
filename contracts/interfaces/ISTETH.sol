// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISTETH is IERC20 {
    function getTotalPooledEther() external view returns (uint256);

    function decimals() external view returns (uint8);

    function symbol() external view returns (string memory);
}
