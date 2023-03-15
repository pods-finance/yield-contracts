// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { Asset } from "./Asset.sol";

contract STETH is Asset {
    constructor() Asset("Liquid staked Ether 2.0", "stETH") {}

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _mint(from, amount);
        // @audit test 1 wei corner case
        _transfer(from, to, amount);
        return true;
    }

    function rebase(address to, int256 interest) public {
        if (interest > 0) {
            _mint(to, uint256(interest));
        } else {
            _burn(to, uint256(-interest));
        }
    }
}
