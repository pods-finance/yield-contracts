// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

interface ICurvePool {
    function exchange(
        int128 from,
        int128 to,
        uint256 input,
        uint256 minOutput
    ) external payable returns (uint256 output);

    function get_dy(
        int128 from,
        int128 to,
        uint256 input
    ) external view returns (uint256 output);
}
