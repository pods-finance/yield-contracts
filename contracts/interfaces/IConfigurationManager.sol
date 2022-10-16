// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

interface IConfigurationManager {
    event SetCap(address indexed target, uint256 value);
    event ParameterSet(address indexed target, bytes32 indexed name, uint256 value);
    event VaultAllowanceSet(address indexed vault, bool allowed);

    error ConfigurationManager__TargetCannotBeTheZeroAddress();

    function setParameter(
        address target,
        bytes32 name,
        uint256 value
    ) external;

    function getParameter(address target, bytes32 name) external view returns (uint256);

    function getGlobalParameter(bytes32 name) external view returns (uint256);

    function setCap(address target, uint256 value) external;

    function getCap(address target) external view returns (uint256);

    function setAllowedVault(address vault, bool allowed) external;

    function isVaultAllowed(address vault) external view returns (bool);
}
