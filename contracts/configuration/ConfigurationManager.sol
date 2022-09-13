// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IConfigurationManager.sol";

/**
 * @title ConfigurationManager
 * @author Pods Finance
 * @notice Allows contracts to read protocol-wide settings
 */
contract ConfigurationManager is IConfigurationManager, Ownable {
    mapping(address => mapping(bytes32 => uint256)) private _parameters;
    mapping(address => bool) private _allowedVault;
    address private immutable _global = address(0);

    /**
     * @dev Define a parameter
     * @param target The parameter name
     * @param name The parameter name
     * @param value The parameter value
     */
    function setParameter(
        address target,
        bytes32 name,
        uint256 value
    ) public override onlyOwner {
        _parameters[target][name] = value;
        emit ParameterSet(target, name, value);
    }

    /**
     * @dev Get the value of a defined parameter
     * @param name The parameter name
     */
    function getParameter(address target, bytes32 name) external view override returns (uint256) {
        return _parameters[target][name];
    }

    /**
     * @dev Get the value of a defined parameter
     * @param name The parameter name
     */
    function getGlobalParameter(bytes32 name) external view override returns (uint256) {
        return _parameters[_global][name];
    }

    /**
     * @dev Defines a cap value to a contract
     * @param target The contract address
     * @param value Cap amount
     */
    function setCap(address target, uint256 value) external override onlyOwner {
        if (target == address(0)) revert ConfigurationManager__InvalidCapTarget();
        setParameter(target, "CAP", value);
        emit SetCap(target, value);
    }

    /**
     * @dev Get the value of a defined cap
     * Note that 0 cap means that the contract is not capped
     * @param target The contract address
     */
    function getCap(address target) external view override returns (uint256) {
        return this.getParameter(target, "CAP");
    }

    /**
     * @dev Sets the allowance to migrate to a `vault` address
     * @param vault The contract address
     * @param allowed Allowance status
     */
    function setAllowedVault(address vault, bool allowed) external override onlyOwner {
        _allowedVault[vault] = allowed;
        emit VaultAllowanceSet(vault, allowed);
    }

    /**
     * @dev Returns if a vault is allowed
     * @param vault The contract address
     */
    function isVaultAllowed(address vault) external view override returns (bool) {
        return _allowedVault[vault];
    }
}
