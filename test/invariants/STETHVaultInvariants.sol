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

    function generateInterest(uint256 interest) public {
        _mint(msg.sender, interest);
    }
}

library String {
    function equal(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

contract FuzzyAddresses {
    address public constant user0 = address(0x10000);
    address public constant user1 = address(0x20000);
    address public constant vaultController = address(0x30000);

    function _addressIsAllowed(address to) internal returns (bool) {
        return to == user0 || to == user1 || to == vaultController;
    }
}

contract STETHVaultInvariants is STETHVault, FuzzyAddresses {
    ConfigurationManager public $configuration = new ConfigurationManager();
    STETH public $asset = new STETH();
    InvestorActorMock public $investor = new InvestorActorMock(address($asset));
    event AssertionFailed(bool);

    struct LastDeposit {
        uint256 amount;
        uint256 roundId;
        uint256 shares;
    }

    mapping(address => LastDeposit) public lastDeposits;

    constructor() STETHVault($configuration, $asset, address($investor)) {
        $configuration.setParameter(address(this), "VAULT_CONTROLLER", 0x30000);
    }

    function echidna_test_name() public view returns (bool) {
        return String.equal(name(), "stETH Volatility Vault");
    }

    function echidna_test_symbol() public returns (bool) {
        return String.equal(symbol(), "stETHvv");
    }

    function echidna_test_decimals() public returns (bool) {
        return decimals() == $asset.decimals();
    }

    function generateInterest(uint256 a) public {
        if (a == 0) return;
        uint256 addInterest = (totalAssets() / a);
        $asset.generateInterest(addInterest);
    }

    //  ["0x10000", "0x20000", "0x30000"]
    function echidna_sum_total_supply() public returns (bool) {
        uint256 balanceA = balanceOf(user0);
        uint256 balanceB = balanceOf(user1);
        uint256 balanceC = balanceOf(vaultController);

        uint256 sumBalances = balanceA + balanceB + balanceC;

        return sumBalances == totalSupply();
    }

    function echidna_lastRoundAssets_always_greater_than_totalAssets() public returns (bool) {
        return totalAssets() >= lastRoundAssets;
    }

    /**
     * @dev This function helps the fuzzer to quickly processDeposits in the right way.
    The variable endIndex its just a random factor to enable process in chunks instead of processing
    only the entire queue size.
     */
    //
    function helpProcessQueue() public {
        this.processQueuedDeposits(this.queuedDeposits());
    }

    function deposit(uint256 assets, address) public override returns (uint256 shares) {
        uint256 createdShares = convertToShares(assets);
        LastDeposit memory newDeposit = LastDeposit({
            amount: assets,
            roundId: vaultState.currentRoundId,
            shares: createdShares
        });
        lastDeposits[msg.sender] = newDeposit;
        return this.deposit(assets, msg.sender);
    }

    function mint(uint256 shares, address) public override returns (uint256 assets) {
        uint256 assets2 = convertToAssets(shares);
        LastDeposit memory newDeposit = LastDeposit({
            amount: assets2,
            roundId: vaultState.currentRoundId,
            shares: shares
        });
        lastDeposits[msg.sender] = newDeposit;
        return this.mint(shares, msg.sender);
    }

    function withdraw(
        uint256 assets,
        address,
        address
    ) public override returns (uint256 shares) {
        bool isNextRound = vaultState.currentRoundId == lastDeposits[msg.sender].roundId + 1;
        uint256 burnShares = _convertToShares(assets, Math.Rounding.Up);

        this.withdraw(assets, msg.sender, msg.sender);
        uint256 userSharesAfterWithdraw = this.balanceOf(msg.sender);

        if (isNextRound && assets > 0) {
            if (burnShares < lastDeposits[msg.sender].shares) {
                lastDeposits[msg.sender].shares -= burnShares;
                lastDeposits[msg.sender].amount -= assets;
            }
            if (burnShares == lastDeposits[msg.sender].shares || userSharesAfterWithdraw == 0) {
                bool isWithdrawLowerThanInitial = assets < lastDeposits[msg.sender].amount;
                if (isWithdrawLowerThanInitial) {
                    emit AssertionFailed(isWithdrawLowerThanInitial);
                }
            }
        }
    }

    function redeem(
        uint256 shares,
        address,
        address
    ) public override returns (uint256 assets) {
        bool isNextRound = vaultState.currentRoundId == lastDeposits[msg.sender].roundId + 1;
        uint256 assetsToWithdraw = convertToAssets(shares);
        uint256 balanceOfShares = this.balanceOf(msg.sender);
        this.redeem(shares, msg.sender, msg.sender);
        if (isNextRound && shares > 0) {
            if (shares < lastDeposits[msg.sender].shares) {
                lastDeposits[msg.sender].shares -= shares;
                lastDeposits[msg.sender].amount -= assetsToWithdraw;
            }
            if (shares == lastDeposits[msg.sender].shares || shares == balanceOfShares) {
                bool isWithdrawLowerThanInitial = assetsToWithdraw < lastDeposits[msg.sender].amount;
                if (isWithdrawLowerThanInitial) {
                    emit AssertionFailed(isWithdrawLowerThanInitial);
                }
            }
        }
    }

    function transfer(address to, uint256 amount) public override(ERC20, IERC20) returns (bool) {
        if (!_addressIsAllowed(to)) return false;
        return super.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override(ERC20, IERC20) returns (bool) {
        if (!_addressIsAllowed(to)) return false;
        return super.transferFrom(from, to, amount);
    }
}
