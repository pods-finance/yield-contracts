// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract Asset is ERC20, ERC20Permit {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name, string memory symbol) ERC20(name, symbol) ERC20Permit(name) {}

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function donate(address to) public {
        _mint(to, 10 ether);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
