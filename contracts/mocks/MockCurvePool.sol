// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/ICurvePool.sol";

contract MockCurvePool is ICurvePool {
    using SafeERC20 for IERC20;
    using Address for address payable;

    uint256 constant DENOMINATOR = 10000;
    uint256 constant N_COINS = 2;
    uint256 constant RATIO = 250; // 2.5%

    address[] public coins = new address[](N_COINS);
    address immutable deployer;

    event TokenExchange(
        address indexed buyer,
        int128 soldId,
        uint256 tokensSold,
        int128 boughtId,
        uint256 tokensBought
    );
    event Received(address indexed giver, uint256 amount);

    constructor(address stETH) {
        deployer = msg.sender;

        coins[0] = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
        coins[1] = stETH;
    }

    function exchange(
        int128 from,
        int128 to,
        uint256 input,
        uint256 minOutput
    ) external payable returns (uint256 output) {
        require(from < int256(N_COINS));
        require(to < int256(N_COINS));
        require(from != to);

        output = get_dy(from, to, input);
        require(output >= minOutput, "Exchange resulted in fewer coins than expected");

        emit TokenExchange(msg.sender, from, input, to, output);

        if (from == 0) {
            require(msg.value == input);
            IERC20(coins[1]).safeTransfer(msg.sender, output);
        } else {
            require(msg.value == 0);
            IERC20(coins[1]).safeTransferFrom(msg.sender, address(this), output);
            payable(msg.sender).sendValue(output);
        }
    }

    function get_dy(
        int128 from,
        int128 to,
        uint256 input
    ) public view returns (uint256 output) {
        uint256 diff = (input * RATIO) / DENOMINATOR;
        uint256 balance;

        if (from == 0 && to == 1) {
            balance = balances(0);
            output = input + diff;
        } else if (from == 1 && to == 0) {
            balance = balances(1);
            output = input - diff;
        }

        return Math.min(output, balance);
    }

    function balances(uint256 i) public view returns (uint256 balance) {
        if (i == 0) {
            balance = address(this).balance;
        } else if (i == 1) {
            balance = IERC20(coins[1]).balanceOf(address(this));
        }
    }

    function drain() external {
        require(msg.sender == deployer);
        payable(deployer).sendValue(address(this).balance);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
