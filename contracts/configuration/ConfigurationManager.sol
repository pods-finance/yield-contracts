//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IConfigurationManager.sol";

/**
 * @title ConfigurationManager
 * @author Pods Finance
 * @notice Allows contracts to read protocol-wide settings
 */
contract ConfigurationManager is IConfigurationManager, Ownable {
    mapping(address => uint256) private _caps;
    mapping(bytes32 => uint256) private _parameters;

    /**
     * @dev Define a parameter
     * @param name The parameter name
     * @param value The parameter value
     */
    function setParameter(bytes32 name, uint256 value) external override onlyOwner {
        _parameters[name] = value;
        emit ParameterSet(name, value);
    }

    /**
     * @dev Get the value of a defined parameter
     * @param name The parameter name
     */
    function getParameter(bytes32 name) external view override returns (uint256) {
        return _parameters[name];
    }

    /**
     * @dev Defines a cap value to a contract
     * @param target The contract address
     * @param value Cap amount
     */
    function setCap(address target, uint256 value) external override onlyOwner {
        if (target == address(0)) revert ConfigurationManager__InvalidCapTarget();
        _caps[target] = value;
        emit SetCap(target, value);
    }

    /**
     * @dev Get the value of a defined cap
     * Note that 0 cap means that the contract is not capped
     * @param target The contract address
     */
    function getCap(address target) external view override returns (uint256) {
        return _caps[target];
    }
}
