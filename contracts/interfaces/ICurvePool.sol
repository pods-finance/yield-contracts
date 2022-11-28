// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

/**
 * @title ICurvePool Curve ETH/stETH StableSwap
 * @notice Curve ETH/stETH StableSwap Interface
 * @author Pods Finance
 */
interface ICurvePool {
    /**
     * @notice Perform an exchange between two coins
     * @dev Index values can be found via the `coins` public getter method
     * @param from Index value for the coin to send
     * @param to Index valie of the coin to recieve
     * @param input Amount of `from` being exchanged
     * @param minOutput Minimum amount of `to` to receive
     * @return output Actual amount of `to` received
     */
    function exchange(
        int128 from,
        int128 to,
        uint256 input,
        uint256 minOutput
    ) external payable returns (uint256 output);

    /**
     * @notice Check price between two coins
     * @dev Index values can be found via the `coins` public getter method
     * @param from Index value for the coin to send
     * @param to Index valie of the coin to recieve
     * @param input Amount of `from` being exchanged
     * @return output estimaed `to` received
     */
    function get_dy(
        int128 from,
        int128 to,
        uint256 input
    ) external view returns (uint256 output);

    function coins(uint256 index) external view returns (address);
}
