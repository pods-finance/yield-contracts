//SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Underlying is ERC20("Underlying", "UND") {
    function mint(uint amount) public {
        _mint(msg.sender, amount);
    }

    function donate(address to) public {
        _mint(to, 10 ether);
    }

    function burn(uint amount) public {
        _burn(msg.sender, amount);
    }
}
