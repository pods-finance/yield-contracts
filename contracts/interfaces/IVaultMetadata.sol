// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "./IVault.sol";

interface IVaultMetadata is IVault {
    function asset() external view returns (address);
}
