// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "@crytic/properties/contracts/util/PropertiesHelper.sol";
import "@crytic/properties/contracts/util/PropertiesConstants.sol";

import "../../contracts/mocks/STETH.sol";
import "../../contracts/mocks/User.sol";
import "../../contracts/vaults/STETHVault.sol";
import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";
import "../../contracts/mocks/YieldSourceMock.sol";
import "./libraries/String.sol";

contract STETHVaultInvariants is PropertiesConstants, PropertiesAsserts {
    ConfigurationManager private $configuration = new ConfigurationManager();
    STETH private $asset = new STETH();
    InvestorActorMock private $investor = new InvestorActorMock(address($asset));
    STETHVault private vault = new STETHVault($configuration, $asset, address($investor));
    mapping(address => User) private users;

    uint256 private constant MAX_ERROR_WITHDRAWAL = 100; // max accepted withdrawal loss due to rounding is 1% of deposited amount
    uint256 private constant MAX_REBASE = 100; // 5% APR from Lido
    uint256 private constant MAX_INVESTOR_GENERATED_PREMIUM = 100; // expected max investor premium generated is 1% of the Vault's TVL

    mapping(address => uint256) private deposits;
    mapping(address => uint256) private withdraws;

    bool private hadWithdralsCurrentRound;
    bool private hadNegativeRebase;

    constructor() {
        $configuration.setParameter(address(vault), "VAULT_CONTROLLER", uint256(uint160(address(this))));
        $investor.approveVaultToPull(address(vault));
        users[USER1] = new User(vault, $asset);
        users[USER2] = new User(vault, $asset);
        users[USER3] = new User(vault, $asset);

        $configuration.setCap(address(vault), uint256(keccak256("cap")));
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

    event Log(int256, int256);

    function rebase(int128 _amount) public {
        int256 amount = clampBetween(
            int256(_amount),
            (-int256(vault.totalAssets()) * int256(MAX_REBASE)) / int256(vault.DENOMINATOR()),
            (int256(vault.totalAssets()) * int256(MAX_REBASE)) / int256(vault.DENOMINATOR())
        );
        if (amount < 0) {
            hadNegativeRebase = true;
        }
        $asset.rebase(address(vault), amount);
    }

    function setFee(uint256 fee) public {
        fee = clampLte(fee, vault.MAX_WITHDRAW_FEE());
        $configuration.setParameter(address(vault), "WITHDRAW_FEE_RATIO", fee);
    }

    function echidna_sum_total_supply() public returns (bool) {
        uint256 balance1 = vault.balanceOf(address(users[USER1]));
        uint256 balance2 = vault.balanceOf(address(users[USER2]));
        uint256 balance3 = vault.balanceOf(address(users[USER3]));

        uint256 sumBalances = balance1 + balance2 + balance3;

        return sumBalances == vault.totalSupply();
    }

    function echidna_totalAssets_always_greater_than_lastRoundAssets_unless_withdrawls_or_negative_rebase()
        public
        returns (bool)
    {
        return hadWithdralsCurrentRound || hadNegativeRebase ? true : vault.totalAssets() >= vault.lastRoundAssets();
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
        assets = clampLte(assets, vault.maxWithdraw(address(user)));

        try user.withdraw(assets) returns (uint256 _shares) {
            shares = _shares;
            hadWithdralsCurrentRound = true;
        } catch {
            if (!vault.isProcessingDeposits() && deposits[msg.sender] > 0 && assets > 0) {
                assert(false);
            }
        }

        withdraws[msg.sender] += assets;

        _assertFullWithdrawlAfterProcessedQueueIsAtLeastDepositedWithinError();
    }

    function redeem(uint256 shares) public returns (uint256 assets) {
        User user = users[msg.sender];
        shares = clampLte(shares, vault.maxRedeem(address(user)));

        assets = vault.convertToAssets(shares);
        try user.redeem(shares) {
            hadWithdralsCurrentRound = true;
        } catch {
            if (!vault.isProcessingDeposits() && deposits[msg.sender] > 0 && shares > 0) {
                assert(false);
            }
        }

        withdraws[msg.sender] += assets;

        _assertFullWithdrawlAfterProcessedQueueIsAtLeastDepositedWithinError();
    }

    function startRound() public returns (uint32) {
        hadWithdralsCurrentRound = false;
        return vault.startRound();
    }

    function endRound() public {
        vault.endRound();
    }

    function generatePremium(uint256 amount) public {
        amount = clampLte(amount, (vault.totalAssets() * MAX_INVESTOR_GENERATED_PREMIUM) / vault.DENOMINATOR());
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

            assertGte(
                withdraws[msg.sender],
                withdrawalMin,
                "Full withdrawal should be at least deposited amount minus rounding errors"
            );
        }
    }
}
