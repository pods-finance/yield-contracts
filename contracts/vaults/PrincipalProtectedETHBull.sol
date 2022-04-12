//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./BaseVault.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedETHBull is BaseVault {
    using FixedPointMath for uint256;

    /**
     * @dev The accumulated debt of buying Call options
     */
    uint totalDebt;

    error PrincipalProtectedETHBull__TargetCallsMismatch();
    error PrincipalProtectedETHBull__FailedSilently();

    constructor(address _underlying, address _strategist) BaseVault(_underlying, _strategist) {}

    /**
     * @dev See {IVault-name}.
     */
    function name() external override pure returns(string memory) {
        return "Principal Protected ETH Bull";
    }

    function buyCalls(address[] calldata targets, bytes[] calldata calls, uint debt) external onlyStrategist {
        _execute(targets, calls);
        // Include the amount spent in options to the liabilities
        totalDebt += debt;
    }

    /**
     * @dev See {BaseVault-previewWithdraw}.
     */
    function previewWithdraw(uint256 shareAmount) public override view returns (uint256) {
        uint256 claimable = shareAmount.mulDivDown(_totalBalance(), totalShares);
        uint256 debtPaid = shareAmount.mulDivDown(totalDebt, totalShares);
        return claimable - debtPaid;
    }

    /**
     * @dev See {BaseVault-_totalBalance}.
     */
    function _totalBalance() internal override view returns(uint) {
        uint invested = underlying.balanceOf(strategist);
        uint parked = underlying.balanceOf(address(this));

        return invested + parked + totalDebt;
    }

    /**
     * @dev Sends custom contract calls.
     */
    function _execute(address[] calldata targets, bytes[] calldata calls) private {
        if (targets.length != calls.length) revert PrincipalProtectedETHBull__TargetCallsMismatch();

        for (uint i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = targets[i].delegatecall(calls[i]);
            if (!success) {
                if (result.length > 0) {
                    // The easiest way to bubble the revert reason is using memory via assembly

                    assembly {
                        let result_size := mload(result)
                        revert(add(32, result), result_size)
                    }
                } else {
                    revert PrincipalProtectedETHBull__FailedSilently();
                }
            }
        }
    }

    function _beforeWithdraw(uint256 shareAmount, uint256) internal override {
        // Pays for current Vault debts
        uint256 debtPaid = shareAmount.mulDivDown(totalDebt, totalShares);
        totalDebt -= debtPaid;
    }
}
