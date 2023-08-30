// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { WwstEth } from "../proxy/WrappedWsteth.sol";

contract WwstEthMock is WwstEth {
    constructor(address payable _underlying) {}

    function transferSharesMock(address _sender, address _recipient, uint256 _sharesAmount) external {
      _transferShares(_sender, _recipient, _sharesAmount);
    }

    function burnSharesMock(address account, uint256 _sharesAmount) external {
      _burnShares(account, _sharesAmount);
    }
}
