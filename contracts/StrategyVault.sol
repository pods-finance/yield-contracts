//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interfaces/IVault.sol";
import "./libs/TransferUtils.sol";

contract StrategyVault is IVault, Ownable {
    using TransferUtils for IERC20Metadata;

    IERC20Metadata public immutable underlying;

    address strategist;

    uint currentRoundId;
    mapping(address => uint) userRounds;
    mapping(address => uint) userShares;
    mapping(address => uint) userLockedShares;
    uint totalLockedShares;

    mapping(address => uint) claimRequest;
    bool claimWindowOpen;

    constructor(address _underlying, address _strategist) {
        underlying = IERC20Metadata(_underlying);
        strategist = _strategist;
    }

    function stake(uint amount) public override {
        uint shareAmount = previewShares(amount);

        underlying.safeTransferFrom(msg.sender, address(this), amount);
        _mint(address(this), shareAmount);

        emit Stake(msg.sender, shareAmount, amount);

        if (userRounds[msg.sender] < currentRoundId) {
            userLockedShares[msg.sender] = 0;
        }

        userRounds[msg.sender] = currentRoundId;
        userShares[msg.sender] += shareAmount;
        userLockedShares[msg.sender] += shareAmount;
        totalLockedShares += shareAmount;

        underlying.safeTransfer(strategist, amount);
    }

    function withdrawShares() public {
        uint unlockedShares = unlockedSharesOf(msg.sender);
        userShares[msg.sender] -= unlockedShares;
        transfer(msg.sender, unlockedShares);
    }

    function requestClaim(address to) external {
        claimRequest[to] = currentRoundId;
        emit ClaimRequested(to, currentRoundId);
    }

    function claim() public override {
        if (claimRequest[msg.sender] != currentRoundId) revert ClaimNotAllowed();
        if (!claimWindow) revert NotInClaimWindow();

        uint shareAmount = balanceOf(msg.sender);
        if (shareAmount == 0) revert CallerHasNoShares();

        uint _totalSupply = totalSupply();
        uint unlockedShares = unlockedSharesOf(msg.sender);

        if (unlockedShares > 0) {
            userShares[msg.sender] -= unlockedShares;
            _burn(address(this), unlockedShares);
        } else {
            _burn(msg.sender, shareAmount);
        }

        uint claimableUnderlying = previewClaim(shareAmount);
        underlying.transfer(msg.sender, claimableUnderlying);

        emit Claim(msg.sender, shareAmount, claimableUnderlying);
    }

    function unlockedSharesOf(address owner) public view returns (uint) {
        return userShares[owner] - userLockedShares[owner];
    }
}
