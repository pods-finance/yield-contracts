//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ICurvePool is IERC20Metadata {
    function get_virtual_price() external view returns (uint256);
    function lp_token() external view returns (address);
    function add_liquidity(uint256[3] calldata amounts, uint256 minAmount, bool useUndelying) external;
    function remove_liquidity_one_coin(uint256 tokenAmount, int128 i, uint256 minAmount, bool useUndelying) external;
}

interface ICurveGauge is IERC20Metadata {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claim_rewards(address to) external;
    function claimable_reward(address owner, address token) external view returns(uint);
    function reward_tokens(uint index) external view returns(address);
}

contract CurveTest {
    uint256 public constant MAX_REWARDS = 8;
    uint256 public constant DENOMINATOR = 10000;
    uint256 public slip = 100;

    IERC20Metadata public constant underlying = IERC20Metadata(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);
    ICurvePool public constant curvePool = ICurvePool(0x445FE580eF8d70FF569aB36e80c647af338db351);
    ICurveGauge public constant curveGaugeToken = ICurveGauge(0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c);
    IERC20Metadata immutable curveLPToken;

    address[] public rewardTokens;

    address immutable owner;

    constructor() {
        owner = msg.sender;
        curveLPToken = IERC20Metadata(curvePool.lp_token());
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setSlippage(uint slippage) external onlyOwner {
        slip = slippage;
    }

    function deposit(uint amount) external onlyOwner {
        require(underlying.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Deposit into Curve
        underlying.approve(address(curvePool), 0);
        underlying.approve(address(curvePool), amount);

        uint curveValue = amount * 1e30 / curvePool.get_virtual_price();
        uint curveValueWithSlippage = curveValue * (DENOMINATOR - slip) / DENOMINATOR;
        curvePool.add_liquidity([0, amount, 0], curveValueWithSlippage, true);

        // Deposit into Gauge
        uint curveLPBalance = curveLPToken.balanceOf(address(this));
        curveLPToken.approve(address(curveGaugeToken), 0);
        curveLPToken.approve(address(curveGaugeToken), curveLPBalance);
        curveGaugeToken.deposit(curveLPBalance);
    }

    function withdraw() external onlyOwner {
        // Withdraw from Gauge
        uint curveGaugeBalance = curveGaugeToken.balanceOf(address(this));
        curveGaugeToken.withdraw(curveGaugeBalance);

        // Withdraw from Curve
        uint curveLPBalance = curveLPToken.balanceOf(address(this));
        uint curveValueWithSlippage = this.position() * (DENOMINATOR - slip) / DENOMINATOR;
        curvePool.remove_liquidity_one_coin(curveLPBalance, 1, curveValueWithSlippage, true);

        require(underlying.transfer(msg.sender, underlying.balanceOf(address(this))), "Transfer failed");
    }

    function claimRewards() external onlyOwner {
        curveGaugeToken.claim_rewards(address(this));
    }

    function drain() external onlyOwner {
        underlying.transfer(msg.sender, underlying.balanceOf(address(this)));
        curveLPToken.transfer(msg.sender, curveLPToken.balanceOf(address(this)));
        curveGaugeToken.transfer(msg.sender, curveGaugeToken.balanceOf(address(this)));
    }

    function claimableRewards() external view returns(uint[MAX_REWARDS] memory rewards) {
        for(uint i = 0; i < MAX_REWARDS; i++) {
            address rewardToken = curveGaugeToken.reward_tokens(i);
            rewards[i] = curveGaugeToken.claimable_reward(address(this), rewardToken);
        }
    }

    function position() external view returns(uint) {
        uint curveBalance = curveLPToken.balanceOf(address(this)) + curveGaugeToken.balanceOf(address(this));

        if (curveBalance > 0) {
            return curveBalance * curvePool.get_virtual_price() / 1e30;
        }

        return 0;
    }
}
