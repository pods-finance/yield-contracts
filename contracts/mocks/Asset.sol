//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Asset is ERC20("Asset", "AST") {
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
