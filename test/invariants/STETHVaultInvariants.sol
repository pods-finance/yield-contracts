// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "../../contracts/mocks/Asset.sol";
import "../../contracts/vaults/STETHVault.sol";
import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";
import "../../contracts/mocks/YieldSourceMock.sol";

contract STETH is Asset {
    constructor() Asset("Liquid staked Ether 2.0", "stETH") {}

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        _mint(from, amount);
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

library String {
    function equal(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

contract FuzzyAddresses {
    address internal constant user0 = address(0x10000);
    address internal constant user1 = address(0x20000);
    address internal constant user2 = address(0x30000);

    function _addressIsAllowed(address to) internal returns (bool) {
        return to == user0 || to == user1 || to == user2;
    }
}

contract User {
    STETHVault private immutable vault;
    STETH private immutable asset;

    constructor(STETHVault _vault, STETH _asset) {
        vault = _vault;
        asset = _asset;

        asset.approve(address(vault), type(uint256).max);
    }

    function deposit(uint256 assets) external returns (uint256) {
        return vault.deposit(assets, address(this));
    }

    function mint(uint256 shares) external returns (uint256) {
        return vault.mint(shares, address(this));
    }

    function withdraw(uint256 assets) external returns (uint256) {
        return vault.withdraw(assets, address(this), address(this));
    }

    function redeem(uint256 shares) external returns (uint256) {
        return vault.redeem(shares, address(this), address(this));
    }
}

contract STETHVaultInvariants is FuzzyAddresses {
    ConfigurationManager private $configuration = new ConfigurationManager();
    STETH private $asset = new STETH();
    InvestorActorMock private $investor = new InvestorActorMock(address($asset));
    STETHVault private vault = new STETHVault($configuration, $asset, address($investor));
    mapping(address => User) private users;

    uint256 private constant MAX_ERROR_WITHDRAWAL = 100; // max accepted withdrawal loss due to rounding is 1% of deposited amount
    uint256 private constant MAX_REBASE = 2; // 5% APR from Lido is approximately 0.02% daily
    uint256 private constant MAX_INVESTOR_GENERATED_PREMIUM = 100; // expected max investor premium generated is 1% of the Vault's TVL

    mapping(address => uint256) private deposits;
    mapping(address => uint256) private withdraws;

    constructor() {
        $configuration.setParameter(address(vault), "VAULT_CONTROLLER", uint256(uint160(address(this))));
        // $configuration.setParameter(address(vault), "WITHDRAW_FEE_RATIO", vault.MAX_WITHDRAW_FEE());
        $investor.approveVaultToPull(address(vault));
        users[user0] = new User(vault, $asset);
        users[user1] = new User(vault, $asset);
        users[user2] = new User(vault, $asset);
    }

    function echidna_test_name() public view returns (bool) {
        return String.equal(vault.name(), "stETH Volatility Vault");
    }

    function echidna_test_symbol() public returns (bool) {
        return String.equal(vault.symbol(), "stETHvv");
    }

    function echidna_test_decimals() public returns (bool) {
        return vault.decimals() == $asset.decimals();
    }

    function positiveRebase(uint256 amount) public {
        amount = Math.min(amount, ($asset.totalSupply() * MAX_INVESTOR_GENERATED_PREMIUM) / vault.DENOMINATOR());
        $asset.rebase(address(vault), int256(amount));
    }

    //  ["0x10000", "0x20000", "0x30000"]
    function echidna_sum_total_supply() public returns (bool) {
        uint256 balance0 = vault.balanceOf(address(users[user0]));
        uint256 balance1 = vault.balanceOf(address(users[user1]));
        uint256 balance2 = vault.balanceOf(address(users[user2]));

        uint256 sumBalances = balance0 + balance1 + balance2;

        return sumBalances == vault.totalSupply();
    }

    function echidna_lastRoundAssets_always_greater_than_totalAssets() public returns (bool) {
        return vault.totalAssets() >= vault.lastRoundAssets();
    }

    function processQueuedDeposits() public {
        vault.processQueuedDeposits(vault.queuedDeposits());
    }

    function deposit(uint256 assets) public returns (uint256 shares) {
        User user = users[msg.sender];

        deposits[msg.sender] += assets;

        return user.deposit(assets);
    }

    function mint(uint256 shares) public returns (uint256 assets) {
        User user = users[msg.sender];

        assets = vault.convertToAssets(shares);
        deposits[msg.sender] += assets;

        return user.mint(shares);
    }

    function withdraw(uint256 assets) public returns (uint256 shares) {
        User user = users[msg.sender];
        assets = Math.min(assets, vault.maxWithdraw(address(user)));

        shares = user.withdraw(assets);
        withdraws[msg.sender] += assets;

        _assertFullWithdrawlAfterProcessedQueueIsAtLeastDepositedWithinError();
    }

    function redeem(uint256 shares) public returns (uint256 assets) {
        User user = users[msg.sender];
        shares = Math.min(shares, vault.maxRedeem(address(user)));

        assets = vault.convertToAssets(shares);
        user.redeem(shares);

        withdraws[msg.sender] += assets;

        _assertFullWithdrawlAfterProcessedQueueIsAtLeastDepositedWithinError();
    }

    function startRound() public returns (uint32) {
        vault.startRound();
    }

    function endRound() public {
        vault.endRound();
    }

    function generatePremium(uint256 amount) public {
        amount = Math.min(amount, (vault.totalAssets() * MAX_INVESTOR_GENERATED_PREMIUM) / vault.DENOMINATOR());
        $investor.generatePremium(amount);
    }

    function buyOptionsWithYield() public {
        $investor.buyOptionsWithYield();
    }

    function _assertFullWithdrawlAfterProcessedQueueIsAtLeastDepositedWithinError() private {
        User user = users[msg.sender];
        if (vault.balanceOf(address(user)) == 0 && vault.totalIdleAssets() == 0) {
            uint256 withdrawalMin = (deposits[msg.sender] * (vault.DENOMINATOR() - MAX_ERROR_WITHDRAWAL)) /
                vault.DENOMINATOR();

            assert(withdraws[msg.sender] >= withdrawalMin);
        }
    }
}
