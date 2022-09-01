// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "./IVault.sol";

interface IVaultMetadata is IVault, IERC20Permit {
    function asset() external view returns (address);
}
