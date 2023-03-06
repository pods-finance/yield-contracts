// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "../../contracts/mocks/Asset.sol";
import "../../contracts/vaults/STETHVault.sol";
import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";
import "../../contracts/mocks/YieldSourceMock.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
    address internal constant user0 = address(0x10000);
    address internal constant user1 = address(0x20000);
    address internal constant vaultController = address(0x30000);

    function _addressIsAllowed(address to) internal returns (bool) {
        return to == user0 || to == user1 || to == vaultController;
    }
}

contract STETHVaultHarness is STETHVault {
    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor
    ) STETHVault(_configuration, _asset, _investor) {}

    // HARNESS: changed to public from internal
    function ___vaultState() public returns (VaultState memory) {
        return vaultState;
    }

    // HARNESS: changed to public from internal
    function ___convertToShares(uint256 assets, Math.Rounding rounding) public view returns (uint256 shares) {
        return _convertToShares(assets, rounding);
    }
}

contract STETHVaultInvariants is FuzzyAddresses {
    ConfigurationManager private $configuration = new ConfigurationManager();
    STETH private $asset = new STETH();
    InvestorActorMock private $investor = new InvestorActorMock(address($asset));
    STETHVaultHarness private vault = new STETHVaultHarness($configuration, $asset, address($investor));

    struct LastDeposit {
        uint256 amount;
        uint256 roundId;
        uint256 shares;
    }

    mapping(address => LastDeposit) private lastDeposits;

    constructor() {
        $configuration.setParameter(address(this), "VAULT_CONTROLLER", uint256(uint160(vaultController)));
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

    function generateInterest(uint256 a) public {
        if (a == 0) return;
        uint256 addInterest = (vault.totalAssets() / a);
        $asset.generateInterest(addInterest);
    }

    //  ["0x10000", "0x20000", "0x30000"]
    function echidna_sum_total_supply() public returns (bool) {
        uint256 balanceA = vault.balanceOf(user0);
        uint256 balanceB = vault.balanceOf(user1);
        uint256 balanceC = vault.balanceOf(vaultController);

        uint256 sumBalances = balanceA + balanceB + balanceC;

        return sumBalances == vault.totalSupply();
    }

    function echidna_lastRoundAssets_always_greater_than_totalAssets() public returns (bool) {
        return vault.totalAssets() >= vault.lastRoundAssets();
    }

    /**
     * @dev This function helps the fuzzer to quickly processDeposits in the right way.
    The variable endIndex its just a random factor to enable process in chunks instead of processing
    only the entire queue size.
     */
    //
    function helpProcessQueue() public {
        vault.processQueuedDeposits(vault.queuedDeposits());
    }

    function deposit(uint256 assets, address) public returns (uint256 shares) {
        uint256 createdShares = vault.convertToShares(assets);
        LastDeposit memory newDeposit = LastDeposit({
            amount: assets,
            roundId: vault.___vaultState().currentRoundId,
            shares: createdShares
        });
        lastDeposits[msg.sender] = newDeposit;
        return vault.deposit(assets, msg.sender);
    }

    function mint(uint256 shares, address) public returns (uint256 assets) {
        uint256 assets2 = vault.convertToAssets(shares);
        LastDeposit memory newDeposit = LastDeposit({
            amount: assets2,
            roundId: vault.___vaultState().currentRoundId,
            shares: shares
        });
        lastDeposits[msg.sender] = newDeposit;
        return vault.mint(shares, msg.sender);
    }

    function withdraw(
        uint256 assets,
        address,
        address
    ) public returns (uint256 shares) {
        bool isNextRound = vault.___vaultState().currentRoundId == lastDeposits[msg.sender].roundId + 1;
        uint256 burnShares = vault.___convertToShares(assets, Math.Rounding.Up);

        vault.withdraw(assets, msg.sender, msg.sender);
        uint256 userSharesAfterWithdraw = vault.balanceOf(msg.sender);

        if (isNextRound && assets > 0) {
            if (burnShares < lastDeposits[msg.sender].shares) {
                lastDeposits[msg.sender].shares -= burnShares;
                lastDeposits[msg.sender].amount -= assets;
            }
            if (burnShares == lastDeposits[msg.sender].shares || userSharesAfterWithdraw == 0) {
                assert(assets >= lastDeposits[msg.sender].amount);
            }
        }
    }

    function redeem(
        uint256 shares,
        address,
        address
    ) public returns (uint256 assets) {
        bool isNextRound = vault.___vaultState().currentRoundId == lastDeposits[msg.sender].roundId + 1;
        uint256 assetsToWithdraw = vault.convertToAssets(shares);
        uint256 balanceOfShares = vault.balanceOf(msg.sender);
        vault.redeem(shares, msg.sender, msg.sender);
        if (isNextRound && shares > 0) {
            if (shares < lastDeposits[msg.sender].shares) {
                lastDeposits[msg.sender].shares -= shares;
                lastDeposits[msg.sender].amount -= assetsToWithdraw;
            }
            if (shares == lastDeposits[msg.sender].shares || shares == balanceOfShares) {
                assert(lastDeposits[msg.sender].amount >= assetsToWithdraw);
            }
        }
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        if (!_addressIsAllowed(to)) return false;
        return vault.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public returns (bool) {
        if (!_addressIsAllowed(to)) return false;
        return vault.transferFrom(from, to, amount);
    }
}
