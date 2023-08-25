import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import minus from '../utils/minus'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import createConfigurationManager from '../utils/createConfigurationManager'
import { feeExcluded } from '../utils/feeExcluded'
import { ConfigurationManager, RebasingWrapper, InvestorActorMock, STETHVault, ISTETH, IwstETH } from '../../typechain'

describe('STETHVault Wrapper', () => {
  let asset: RebasingWrapper, vault: STETHVault, investor: InvestorActorMock,
    configuration: ConfigurationManager, stEthContract: ISTETH, wstETHContract: IwstETH

  let user0: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress, user4: SignerWithAddress, user5: SignerWithAddress,
    yieldGenerator: SignerWithAddress, vaultController: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    await startMainnetFork()

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x06601571aa9d3e8f5f7cdd5b993192618964bab5']
    })

    user0 = await ethers.getSigner('0x06601571aa9d3e8f5f7cdd5b993192618964bab5')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x6cf9aa65ebad7028536e353393630e2340ca6049']
    })

    user1 = await ethers.getSigner('0x6cf9aa65ebad7028536e353393630e2340ca6049')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0xcebb2d6335ffa869f86f04a169015f9b613c2c04']
    })

    yieldGenerator = await ethers.getSigner('0xcebb2d6335ffa869f86f04a169015f9b613c2c04')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x0c67f4ffc902140c972ecab356c9993e6ce8caf3']
    })

    user2 = await ethers.getSigner('0x0c67f4ffc902140c972ecab356c9993e6ce8caf3')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5']
    })

    user3 = await ethers.getSigner('0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0xed0eebb4d520a6b0eccc4df8e5214e7a6697c111']
    })

    user4 = await ethers.getSigner('0xed0eebb4d520a6b0eccc4df8e5214e7a6697c111')

    ;[user5, , , , vaultController] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    // Lido's stEth
    stEthContract = await ethers.getContractAt('ISTETH', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
    // Wrapper of wstETH
    const wstETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'
    wstETHContract = await ethers.getContractAt('IwstETH', wstETH)
    const RebasingWrapperFactory = await ethers.getContractFactory('RebasingWrapper')
    asset = await RebasingWrapperFactory.deploy(wstETH)

    const depositUsersFundsIntoWrapper = async (user: SignerWithAddress): Promise<void> => {
      const userFunds = await stEthContract.balanceOf(user.address)
      await stEthContract.connect(user).approve(wstETHContract.address, ethers.constants.MaxUint256)
      await wstETHContract.connect(user).wrap(userFunds)
      const userWrappedFunds = await wstETHContract.balanceOf(user.address)
      await wstETHContract.connect(user).approve(asset.address, ethers.constants.MaxUint256)
      await asset.connect(user).depositFor(user.address, userWrappedFunds)
    }

    await Promise.all([
      depositUsersFundsIntoWrapper(user0),
      depositUsersFundsIntoWrapper(user1),
      depositUsersFundsIntoWrapper(user2),
      depositUsersFundsIntoWrapper(user3),
      depositUsersFundsIntoWrapper(user4),
      depositUsersFundsIntoWrapper(yieldGenerator)
    ])

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    // The precision of this number is set by the variable DENOMINATOR. 5000 is equivalent to 50%
    const investorRatio = ethers.BigNumber.from('5000')

    const STETHVault = await ethers.getContractFactory('STETHVault')
    vault = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address,
      investorRatio
    )

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address)

    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user3).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user4).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  after(async () => {
    await stopMainnetFork()
  })

  describe('ERC20 checks', () => {
    it('has a name', async () => {
      expect(await vault.name()).to.be.equal(`${await asset.symbol()} Volatility Vault`)
    })

    it('has a symbol', async () => {
      expect(await vault.symbol()).to.be.equal(`${await asset.symbol()}vv`)
    })

    it('has decimals', async () => {
      expect(await vault.decimals()).to.be.equal(await asset.decimals())
    })
  })

  it('should accept short circuited deposit path', async () => {
    /**
     * Setup: transfering ETH to the wstETH contract is a way to mint wstETH
     * directly from ETH. exchangeRateBalanceBefore is the amount of wstETH
     * that user5 has after the setup and before any test logic is executed.
     * We are using user0 just as a faucet.
     */
    const oneHundredEth = ethers.utils.parseEther('100')
    await user0.sendTransaction({
      to: wstETHContract.address,
      value: oneHundredEth
    })
    const user0Balance = await wstETHContract.balanceOf(user0.address)
    await wstETHContract.connect(user0).transfer(user5.address, user0Balance)
    const exchangeRateBalanceBefore = await wstETHContract.balanceOf(user5.address)

    /**
     * Test: user5 deposits wstETH into the vault. This is a short circuited
     * deposit path because the user is depositing wstETH directly into the
     * wrapper and the wrapper contract sends the wwstETH to the vault.
     */
    await wstETHContract.connect(user5).approve(asset.address, exchangeRateBalanceBefore)
    await asset.connect(user5).invest(vault.address, exchangeRateBalanceBefore)

    /**
     * Assert: the user's assets should be close to the amount of ETH that was
     * deposited into the wrapper.Some wei are lost due to rounding errors.
     */
    const assetsOf = await vault.assetsOf(user5.address)
    expect(assetsOf).to.be.closeTo(oneHundredEth, 2)

    /**
     * endRound/startRound to process queued deposits
     */
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user5.address, user1.address])
    await vault.connect(vaultController).startRound()
    /**
     * Test: user5 withdraws all of their assets from the vault. This is a
     * short circuited withdraw path because the user is withdrawing and unwraping
     * their assets in one go.
     */
    await vault.connect(user5).approve(asset.address, assetsOf)
    await asset.connect(user5).remove(vault.address, assetsOf)
    /**
     * Assets: after the invest/remove actions, the user's assets should be
     * close to the amount of ETH that was deposited initially.
     */
    const maxW = await vault.maxWithdraw(user5.address)
    const exchangeRateBalanceAfter = await wstETHContract.balanceOf(user5.address)
    const wrapperBalanceAfter = await asset.balanceOf(user5.address)
    const vaultBalanceAfter = await vault.balanceOf(user5.address)
    expect(exchangeRateBalanceAfter).to.be.closeTo(feeExcluded(exchangeRateBalanceBefore), 2)
    expect(maxW).to.be.closeTo(0, 2)
    expect(wrapperBalanceAfter).to.be.closeTo(0, 2)
    expect(vaultBalanceAfter).to.be.closeTo(0, 2)
  })

  describe('Sanity checks', () => {
    it('should behave equally if someone tries to mint 0 shares', async () => {
      const assets = ethers.utils.parseEther('10')

      // Users deposits to vault
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(user1).mint('0', user2.address)
      await vault.connect(user1).mint('0', user1.address)
      await vault.connect(user1).mint(assets, user2.address)

      const previewMintedAssets = await vault.previewMint(assets)
      await vault.connect(user1).mint(assets, user1.address)
      await vault.connect(user1).mint('0', user1.address)
      await vault.connect(user1).mint('0', user1.address)

      const idleAssetsUser1 = await vault.idleAssetsOf(user1.address)
      const idleAssetsUser0 = await vault.idleAssetsOf(user0.address)
      expect(idleAssetsUser0).to.be.closeTo(assets, '1')
      expect(idleAssetsUser1).to.be.closeTo(previewMintedAssets, '1')

      const totalIdleAssets = await vault.totalIdleAssets()

      expect(totalIdleAssets).to.be.closeTo(previewMintedAssets.add(assets).add(assets), '1')

      expect(await vault.depositQueueSize()).to.be.equal(3)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      await vault.connect(vaultController).startRound()

      const idleAssetsUser1After = await vault.idleAssetsOf(user1.address)
      const idleAssetsUser0After = await vault.idleAssetsOf(user0.address)

      expect(idleAssetsUser1After).to.be.equal(0)
      expect(idleAssetsUser0After).to.be.equal(0)

      const maxWithdraw0 = await vault.maxWithdraw(user0.address)
      const maxWithdraw1 = await vault.maxWithdraw(user1.address)
      expect(maxWithdraw1).to.be.equal(feeExcluded(previewMintedAssets))
      expect(maxWithdraw0).to.be.equal(feeExcluded(assets))
    })
  })

  describe('Rounding issues', () => {
    it('should not withdraw non-null amounts and burn 0 shares in the process', async () => {
      const user0Deposit = '5'
      const user1Deposit = ethers.utils.parseEther('2')
      const user2Deposit = ethers.utils.parseEther('4')
      const user3Deposit = ethers.utils.parseEther('6')
      const user4Deposit = ethers.utils.parseEther('9')

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(user2).deposit(user2Deposit, user2.address)
      await vault.connect(user3).deposit(user3Deposit, user3.address)
      await vault.connect(user4).deposit(user4Deposit, user4.address)

      const oldBalance = await asset.balanceOf(vault.address)
      const newMint = oldBalance.mul(5).div(100)

      // Increase totalAssets() value
      await asset.connect(yieldGenerator).transfer(vault.address, newMint)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user1.address, user2.address, user3.address, user4.address, user0.address])
      await vault.connect(vaultController).startRound()

      const supplyUser0Before = await vault.balanceOf(user0.address)
      const assetBalanceUser0Before = await asset.balanceOf(user0.address)

      await vault.connect(user0).withdraw('3', user0.address, user0.address)

      const supplyUser0After = await vault.balanceOf(user0.address)
      const assetBalanceUser0After = await asset.balanceOf(user0.address)

      expect(supplyUser0After).to.be.eq(supplyUser0Before.sub(2))
      expect(assetBalanceUser0After).to.be.eq(assetBalanceUser0Before.add(2))
    })
  })

  describe('Reading functions', () => {
    it('sharePrice should not revert in the case of 0 totalSupply', async () => {
      const sharePriceDecimals = await vault.sharePriceDecimals()
      const totalSupply = await vault.totalSupply()
      expect(totalSupply).to.be.eq(0)
      const initialSharePrice = await vault.sharePrice()
      expect(initialSharePrice).to.be.eq(BigNumber.from('10').pow(sharePriceDecimals))
    })

    it('maxWithdraw and withdraw should match', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      // Round 1
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('103'))

      const user0maxWithdraw = await vault.maxWithdraw(user0.address)
      const user1maxWithdraw = await vault.maxWithdraw(user1.address)

      await expect(async () => await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address))
        .to.changeTokenBalance(
          asset,
          user0,
          user0maxWithdraw.sub(1)
        )

      await expect(async () => await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address))
        .to.changeTokenBalance(
          asset,
          user1,
          user1maxWithdraw.add(2)
        )

      const vaultBalance = await asset.balanceOf(vault.address)
      const user0BalanceOf = await vault.balanceOf(user0.address)
      const user1BalanceOf = await vault.balanceOf(user1.address)

      expect(vaultBalance).to.be.closeTo('0', 2)
      expect(user0BalanceOf).to.be.equal('0')
      expect(user1BalanceOf).to.be.equal('0')
    })

    it('should return 0 in maxWithdraw when vault is unable to perform withdraw', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()

      expect(await vault.maxWithdraw(user0.address)).to.be.eq(0)
    })

    it('maxRedeem and withdraw should match', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      // Round 1
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('103'))

      const user0maxRedeem = await vault.maxRedeem(user0.address)
      const user1maxRedeem = await vault.maxRedeem(user1.address)

      const user0maxShares = await vault.balanceOf(user0.address)
      const user1maxShares = await vault.balanceOf(user1.address)

      expect(user0maxRedeem).to.be.equal(user0maxShares)
      expect(user1maxRedeem).to.be.equal(user1maxShares)
    })

    it('should return 0 in maxRedeem when vault is unable to perform redeem', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()

      expect(await vault.maxRedeem(user0.address)).to.be.eq(0)
    })

    it('should return 0 in maxMint when vault is unable to perform mint', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()

      expect(await vault.maxMint(user0.address)).to.be.eq(0)
    })

    it('should return 0 in maxDeposit when vault is unable to perform deposit', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()

      expect(await vault.maxDeposit(user0.address)).to.be.eq(0)
    })

    it('assetsOf should match in a mixed case', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.sub(1))

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])

      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.sub(1))

      // Round 1
      await vault.connect(vaultController).startRound()
      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.sub(1))

      await vault.connect(user0).deposit(user0Deposit, user0.address)

      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(2).sub(2))

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(2).sub(2))

      await asset.connect(yieldGenerator).transfer(vault.address, assets)

      expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(3).sub(3))
    })
  })

  describe('Lifecycle', () => {
    it('cannot redeem between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('100')

      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      const shares = await vault.balanceOf(user0.address)

      await expect(
        vault.connect(user0).redeem(shares, user0.address, user0.address)
      ).to.be.revertedWithCustomError(vault, 'IVault__ForbiddenWhileProcessingDeposits')
    })

    it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('100')

      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])

      await expect(
        vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      ).to.be.revertedWithCustomError(vault, 'IVault__ForbiddenWhileProcessingDeposits')
    })

    it('cannot deposit between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('10')

      await vault.connect(vaultController).endRound()
      await expect(
        vault.connect(user0).deposit(assets, user0.address)
      ).to.be.revertedWithCustomError(vault, 'IVault__ForbiddenWhileProcessingDeposits')
    })

    it('cannot mint between a round\'s end and the beginning of the next', async () => {
      const shares = ethers.utils.parseEther('10')

      await vault.connect(vaultController).endRound()
      await expect(
        vault.connect(user0).mint(shares, user0.address)
      ).to.be.revertedWithCustomError(vault, 'IVault__ForbiddenWhileProcessingDeposits')
    })

    it('cannot processQueue After round started', async () => {
      const assetAmount = ethers.utils.parseEther('10')

      await vault.connect(user0).deposit(assetAmount, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).startRound()
      await expect(
        vault.connect(vaultController).processQueuedDeposits([user0.address])
      ).to.be.revertedWithCustomError(vault, 'IVault__NotProcessingDeposits')
    })

    it('cannot start or end rounds twice', async () => {
      await vault.connect(vaultController).endRound()
      await expect(vault.connect(vaultController).endRound())
        .to.be.revertedWithCustomError(vault, 'IVault__AlreadyProcessingDeposits')

      await vault.connect(vaultController).startRound()
      await expect(vault.connect(vaultController).startRound())
        .to.be.revertedWithCustomError(vault, 'IVault__NotProcessingDeposits')
    })
  })

  describe('Permit', () => {
    it('can deposit with permits', async () => {
      const assets = ethers.utils.parseEther('10')

      const mockPermit = {
        deadline: +new Date(),
        v: 0,
        r: ethers.utils.randomBytes(32),
        s: ethers.utils.randomBytes(32)
      }

      const tx = vault.connect(user0).depositWithPermit(
        assets,
        user0.address,
        mockPermit.deadline,
        mockPermit.v,
        mockPermit.r,
        mockPermit.s
      )

      await expect(tx)
        .to.be.revertedWithCustomError(vault, 'STETHVault__PermitNotAvailable')
    })

    it('can mint with permits', async () => {
      const shares = ethers.utils.parseEther('10')

      const mockPermit = {
        deadline: +new Date(),
        v: 0,
        r: ethers.utils.randomBytes(32),
        s: ethers.utils.randomBytes(32)
      }

      const tx = vault.connect(user0).mintWithPermit(
        shares,
        user0.address,
        mockPermit.deadline,
        mockPermit.v,
        mockPermit.r,
        mockPermit.s
      )

      await expect(tx)
        .to.be.revertedWithCustomError(vault, 'STETHVault__PermitNotAvailable')
    })
  })

  describe('Events', () => {
    it('endSharePrice should be consistent with the vault state', async () => {
      // This test will only work if InvestRatio = 50%
      const assetAmount = ethers.utils.parseEther('100')

      // Round 0
      await vault.connect(user0).deposit(assetAmount, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])

      // Round 1 - Earned 10% during the week
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('10'))
      await vault.connect(user1).deposit(assetAmount, user1.address)
      const endRoundTx = await vault.connect(vaultController).endRound()
      await expect(endRoundTx).to.emit(vault, 'SharePrice').withArgs('1', ethers.utils.parseEther('1'), ethers.utils.parseEther('1.05'))
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      await vault.connect(vaultController).startRound()

      // IMPORTANT => Empty investor wallet to simulate that we bought options during this round
      await investor.buyOptionsWithYield()

      // Round 2 - Starting the Round with 205 assets
      // Round 2 - Earned 10% during the week (+20.5) + 20x of premium (5 used to buy options times 20 = 100)
      // Round 2 - total assets in the end = 205 + 20.5 (yield) + 100 (premium) - 10.25 (buying new options) = 315.25
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20.5'))
      await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('100'))
      const endRoundTx2 = await vault.connect(vaultController).endRound()
      await expect(endRoundTx2).to.emit(vault, 'SharePrice').withArgs('2', '1050000000000000000', '1614695121951219512')
      expect(await vault.sharePrice()).to.be.equal('1614695121951219512')
    })
  })

  describe('Refund', () => {
    it('should match the variation in Cap and the refund shares', async () => {
      const cap = ethers.utils.parseEther('30')

      // This test will only work if InvestRatio = 50%
      const user0Amount = ethers.utils.parseEther('10')
      const user1Amount = ethers.utils.parseEther('3')
      const user2Amount = ethers.utils.parseEther('0.2')
      const user3Amount = ethers.utils.parseEther('1')

      // Round 0
      await configuration.setCap(vault.address, cap)
      await vault.connect(user0).deposit(user0Amount, user0.address)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])

      // Round 1
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
      await vault.connect(vaultController).endRound()

      // Round 2
      await vault.connect(vaultController).startRound()
      await vault.connect(user1).deposit(user1Amount, user1.address)
      await vault.connect(user2).deposit(user2Amount, user2.address)
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
      await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('1300'))
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user1.address, user2.address])

      // Round 3
      await vault.connect(vaultController).startRound()
      await vault.connect(user3).deposit(user3Amount, user3.address)

      const avaiableCapBeforeRefund = await vault.availableCap()
      await vault.connect(user3).refund()

      const avaiableCapAfterRefund = await vault.availableCap()
      const diffRefund = avaiableCapAfterRefund.sub(avaiableCapBeforeRefund)

      await vault.connect(user3).deposit(user3Amount, user3.address)
      await investor.buyOptionsWithYield()
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user3.address])
      await vault.connect(vaultController).startRound()

      const user3Shares = await vault.balanceOf(user3.address)
      expect(user3Shares).to.be.eq(diffRefund)
    })
  })

  it('should be able to end a round even in a negative rebasing event 2', async () => {
    const user0DepositAmount = ethers.utils.parseEther('1').add(1)
    const user1DepositAmount = ethers.utils.parseEther('50')

    await vault.connect(user0).deposit(user0DepositAmount, user0.address)
    await vault.connect(user1).deposit(user1DepositAmount, user1.address)
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
    await vault.connect(vaultController).startRound()

    await vault.connect(user0).deposit(user0DepositAmount, user0.address)

    // Force reduction of Lidos balance to simulate a slashing event
    // SLOT_STETH_BALANCE is equal to keccak256("lido.Lido.beaconBalance")
    const SLOT_STETH_BALANCE = '0xa66d35f054e68143c18f32c990ed5cb972bb68a68f500cd2dd3a16bbf3686483'

    const balanceSTETHBefore = await asset.totalSupply()
    const newBalance = balanceSTETHBefore.div(8).mul(7)
    const newBalancePad32 = ethers.utils.hexZeroPad(ethers.utils.hexValue(newBalance), 32)

    await ethers.provider.send('hardhat_setStorageAt', [
      stEthContract.address,
      SLOT_STETH_BALANCE,
      newBalancePad32
    ])

    const balanceSTETHAfter = await asset.totalSupply()

    // Check if storage manipulation was successful
    expect(balanceSTETHAfter).to.be.lt(balanceSTETHBefore)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address])
    await vault.connect(vaultController).startRound()

    // Reset state
    const oldBalancePad32 = ethers.utils.hexZeroPad(ethers.utils.hexValue(balanceSTETHBefore), 32)

    await ethers.provider.send('hardhat_setStorageAt', [
      stEthContract.address,
      SLOT_STETH_BALANCE,
      oldBalancePad32
    ])
  })

  it('should remove the same amount independently of the process order', async () => {
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('0'))

    const user0DepositAmount = ethers.utils.parseEther('1').add(1)
    const user1DepositAmount = ethers.utils.parseEther('50')

    await vault.connect(user0).deposit(user0DepositAmount, user0.address)
    await vault.connect(user1).deposit(user1DepositAmount, user1.address)
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
    await vault.connect(vaultController).startRound()

    const user0SharesCreatedCombined = await vault.balanceOf(user0.address)
    const user1SharesCreatedCombined = await vault.balanceOf(user1.address)

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

    const user0FinalBalanceCombined = await asset.balanceOf(user0.address)
    const user1FinalBalanceCombined = await asset.balanceOf(user1.address)

    await vault.connect(user0).deposit(user0DepositAmount, user0.address)
    await vault.connect(user1).deposit(user1DepositAmount, user1.address)
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).processQueuedDeposits([user0.address])
    await vault.connect(vaultController).processQueuedDeposits([user1.address])
    await vault.connect(vaultController).startRound()

    const user0SharesCreatedSeparate = await vault.balanceOf(user0.address)
    const user1SharesCreatedSeparate = await vault.balanceOf(user1.address)

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

    const user0FinalBalanceSeparate = await asset.balanceOf(user0.address)
    const user1FinalBalanceSeparate = await asset.balanceOf(user1.address)

    // This difference of 100 is due precision rounding between operations
    expect(user0SharesCreatedSeparate).to.be.closeTo(user0SharesCreatedCombined, '100')
    expect(user1SharesCreatedSeparate).to.be.closeTo(user1SharesCreatedCombined, '100')
    expect(user0FinalBalanceSeparate).to.be.closeTo(user0FinalBalanceCombined, '100')
    expect(user1FinalBalanceSeparate).to.be.closeTo(user1FinalBalanceCombined, '100')
  })

  it('should add collateral and receive shares', async () => {
    const assetAmount = ethers.utils.parseEther('10')
    const assetAmountEffective = assetAmount.sub(1)

    // User0 deposits to vault
    await expect(async () => await vault.connect(user0).deposit(assetAmount, user0.address))
      .to.changeTokenBalances(
        asset,
        [user0, vault],
        [minus(assetAmount), assetAmountEffective]
      )
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.closeTo(assetAmount, 1)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address])
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.closeTo(assetAmount, 1)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
  })

  it('withdraws proportionally', async () => {
    const assetAmount = ethers.utils.parseEther('10')
    const assetAmountUser0 = assetAmount.mul(2)
    const assetAmountUser0Effective = assetAmountUser0.sub(1)
    const assetAmountUser1 = assetAmount
    const assetAmountUser1Effective = assetAmountUser1
    const effectiveTotal = assetAmountUser0Effective.add(assetAmountUser1Effective)

    // Users deposits to vault
    await expect(async () => await vault.connect(user0).deposit(assetAmountUser0, user0.address))
      .to.changeTokenBalances(
        asset,
        [user0, vault],
        [minus(assetAmountUser0Effective), assetAmountUser0Effective]
      )
    await expect(async () => await vault.connect(user1).deposit(assetAmountUser1, user1.address))
      .to.changeTokenBalances(
        asset,
        [user1, vault],
        [minus(assetAmountUser1Effective), assetAmountUser1Effective]
      )

    expect(await asset.balanceOf(vault.address)).to.be.equal(effectiveTotal)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.closeTo(assetAmountUser0, 1)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.closeTo(assetAmountUser1, 1)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)
  })

  it('full cycle test case 2', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('100')

    // Round 0
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address])

    // Round 1
    await vault.connect(vaultController).startRound()
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(assetAmount, user1.address)
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])

    // Round 3
    await vault.connect(vaultController).startRound()
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('70'))

    const expectedUser0Amount = BigNumber.from('1495424836601307189549')
    const expectedUser1Amount = BigNumber.from('104575163398692810446')

    await expect(async () =>
      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    )
      .to.changeTokenBalances(
        asset,
        [vault, user0],
        [minus(expectedUser0Amount), feeExcluded(expectedUser0Amount).add(1)]
      )

    await expect(async () =>
      await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    )
      .to.changeTokenBalances(
        asset,
        [vault, user1],
        [minus(expectedUser1Amount), feeExcluded(expectedUser1Amount).add(1)]
      )

    expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 15)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.totalIdleAssets()).to.be.equal(0)
  })

  it('should emit shares amount in Deposit Event accordingly', async () => {
    // This test will only work if InvestRatio = 50%
    const user0Amount = ethers.utils.parseEther('10')
    const user1Amount = ethers.utils.parseEther('3')
    const user2Amount = ethers.utils.parseEther('0.2')
    const user3Amount = ethers.utils.parseEther('1')

    // Round 0
    const tx0 = await vault.connect(user0).deposit(user0Amount, user0.address)

    // Get Emitted Shares
    const filter0 = await vault.filters.Deposit(user0.address)
    const events0 = await vault.queryFilter(filter0, tx0.blockNumber, tx0.blockNumber)
    const emittedSharesBN1 = events0[0].args.shares

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address])

    // Round 1
    await vault.connect(vaultController).startRound()
    const amountOfSharesUser1After = await vault.balanceOf(user0.address)

    expect(emittedSharesBN1).to.be.eq(amountOfSharesUser1After)

    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(user1Amount, user1.address)
    await vault.connect(user2).deposit(user2Amount, user2.address)
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user1.address, user2.address])

    // Round 3
    await vault.connect(vaultController).startRound()
    const tx1 = await vault.connect(user3).deposit(user3Amount, user3.address)

    // Get Emitted Shares
    const filter1 = await vault.filters.Deposit(user3.address)
    const events1 = await vault.queryFilter(filter1, tx1.blockNumber, tx1.blockNumber)
    const emittedSharesBN = events1[0].args.shares

    const amountOfSharesUser3Before = await vault.balanceOf(user3.address)
    expect(amountOfSharesUser3Before).to.be.eq(0)

    await investor.buyOptionsWithYield()
    const investorBalanceBeforeEndRound = await asset.balanceOf(await vault.investor())
    expect(investorBalanceBeforeEndRound).to.be.closeTo(0, 1)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user3.address])
    await vault.connect(vaultController).startRound()

    const amountOfSharesUser3After = await vault.balanceOf(user3.address)

    expect(emittedSharesBN).to.be.eq(amountOfSharesUser3After)
  })

  it('sanity check + startRound forgetting the process the queue case', async () => {
    // This test will only work if InvestRatio = 50%
    const user0Deposit = ethers.utils.parseEther('10')
    const user1Deposit = ethers.utils.parseEther('20')
    const user2Deposit = ethers.utils.parseEther('30')
    const user3Deposit = ethers.utils.parseEther('103')

    // Round 0
    await vault.connect(user0).deposit(user0Deposit, user0.address)
    await vault.connect(user1).deposit(user1Deposit, user1.address)
    await vault.connect(user2).deposit(user2Deposit, user2.address)
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address, user2.address])

    await vault.connect(vaultController).startRound()

    const user0Moment1maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment1maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment1maxWithdraw = await vault.maxWithdraw(user2.address)
    // console.log(‘MOMENT 1 - Should have the same amounts’)
    expect(user0Moment1maxWithdraw).to.be.closeTo(feeExcluded(user0Deposit), 1)
    expect(user1Moment1maxWithdraw).to.be.closeTo(feeExcluded(user1Deposit), 1)
    expect(user2Moment1maxWithdraw).to.be.closeTo(feeExcluded(user2Deposit), 1)

    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('100'))

    const user0Moment2maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment2maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment2maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 2 - Should have amounts greater than MOMENT 1’)
    expect(user0Moment2maxWithdraw).to.be.gte(user0Moment1maxWithdraw)
    expect(user1Moment2maxWithdraw).to.be.gte(user1Moment1maxWithdraw)
    expect(user2Moment2maxWithdraw).to.be.gte(user2Moment1maxWithdraw)

    await vault.connect(user3).deposit(user3Deposit, user3.address)

    const user0Moment3maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment3maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment3maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 3 - Should have the same amounts of 2’)
    expect(user0Moment3maxWithdraw).to.be.closeTo(user0Moment2maxWithdraw, 1)
    expect(user1Moment3maxWithdraw).to.be.closeTo(user1Moment2maxWithdraw, 1)
    expect(user2Moment3maxWithdraw).to.be.closeTo(user2Moment2maxWithdraw, 1)

    await vault.connect(vaultController).endRound()

    const user0Moment4maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment4maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment4maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 4 - Should have less amount than 3 -> transferred some funds to investor’)
    expect(user0Moment4maxWithdraw).to.be.eq(0)
    expect(user1Moment4maxWithdraw).to.be.eq(0)
    expect(user2Moment4maxWithdraw).to.be.eq(0)

    await vault.connect(vaultController).startRound()

    const user0Moment5maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment5maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment5maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 5 - Should have less amount than 3 -> transferred some funds to investor’)
    expect(user0Moment5maxWithdraw).to.be.lt(user0Moment3maxWithdraw)
    expect(user1Moment5maxWithdraw).to.be.lt(user1Moment3maxWithdraw)
    expect(user2Moment5maxWithdraw).to.be.lt(user2Moment3maxWithdraw)

    await investor.buyOptionsWithYield()

    const user0Moment6maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment6maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment6maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 6 - Should have the same amount as MOMENT 5 and 4’)
    expect(user0Moment6maxWithdraw).to.be.closeTo(user0Moment5maxWithdraw, 1)
    expect(user1Moment6maxWithdraw).to.be.closeTo(user1Moment5maxWithdraw, 1)
    expect(user2Moment6maxWithdraw).to.be.closeTo(user2Moment5maxWithdraw, 1)

    await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('600'))
    // await investor.generatePremium(ethers.utils.parseEther(‘600’))

    const user0Moment7maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment7maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment7maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 7 - Should have the same amount as MOMENTS 6, 5, and 4’)
    expect(user0Moment7maxWithdraw).to.be.closeTo(user0Moment6maxWithdraw, 1)
    expect(user1Moment7maxWithdraw).to.be.closeTo(user1Moment6maxWithdraw, 1)
    expect(user2Moment7maxWithdraw).to.be.closeTo(user2Moment6maxWithdraw, 1)

    await vault.connect(vaultController).endRound()

    const user0Moment8maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment8maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment8maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 8 - Should be equal to 0 -> Compliant to ERC4626’)
    expect(user0Moment8maxWithdraw).to.be.eq(0)
    expect(user1Moment8maxWithdraw).to.be.eq(0)
    expect(user2Moment8maxWithdraw).to.be.eq(0)

    await vault.connect(vaultController).startRound()

    const user0Moment9maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment9maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment9maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 9 - Should have the larger amount as MOMENT 7 -> due the premium collected in the EndRound’)
    expect(user0Moment9maxWithdraw).to.be.gt(user0Moment7maxWithdraw)
    expect(user1Moment9maxWithdraw).to.be.gt(user1Moment7maxWithdraw)
    expect(user2Moment9maxWithdraw).to.be.gt(user2Moment7maxWithdraw)

    const sharesAmount0 = await vault.balanceOf(user0.address)
    const sharesAmount1 = await vault.balanceOf(user1.address)
    const sharesAmount2 = await vault.balanceOf(user2.address)

    // console.log(‘MOMENT 10 - Should have the same amount as 8 and 9 minus fee’)
    await expect(async () =>
      await vault.connect(user0).redeem(sharesAmount0, user0.address, user0.address)
    )
      .to.changeTokenBalance(
        asset,
        user0,
        user0Moment9maxWithdraw
      )

    await expect(async () =>
      await vault.connect(user1).redeem(sharesAmount1, user1.address, user1.address)
    )
      .to.changeTokenBalance(
        asset,
        user1,
        user1Moment9maxWithdraw
      )

    await expect(async () =>
      await vault.connect(user2).redeem(sharesAmount2, user2.address, user2.address)
    )
      .to.changeTokenBalance(
        asset,
        user2,
        user2Moment9maxWithdraw
      )
  })

  it('should not allow first depositor to steal funds from subsequent depositors', async () => {
    const Asset = await ethers.getContractFactory('Asset')
    const asset = await Asset.deploy('Asset', 'AST')

    const STETHVault = await ethers.getContractFactory('STETHVault')
    const vault = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address,
      5000
    )

    await investor.approveVaultToPull(vault.address)

    await configuration.setParameter(
      vault.address,
      ethers.utils.formatBytes32String('VAULT_CONTROLLER'),
      vaultController.address
    )

    const assetsUser0 = ethers.utils.parseEther('10')
    const assetsUser1 = ethers.utils.parseEther('0.01')
    const attacker = user2

    // Legit users deposit
    await asset.connect(user0).mint(assetsUser0)
    await asset.connect(user0).approve(vault.address, assetsUser0)
    await vault.connect(user0).deposit(assetsUser0, user0.address)
    await asset.connect(user1).mint(assetsUser1)
    await asset.connect(user1).approve(vault.address, assetsUser1)
    await vault.connect(user1).deposit(assetsUser1, user1.address)

    // Attacker setup
    await asset.connect(attacker).mint(1)
    await asset.connect(attacker).approve(vault.address, 1)
    await vault.connect(attacker).deposit(1, attacker.address)

    await vault.connect(vaultController).endRound()
    // Attacker backruns endRound
    const attackAmount = assetsUser0.add(1)
    await asset.connect(attacker).mint(attackAmount)
    await asset.connect(attacker).transfer(vault.address, attackAmount)

    // Tries to process reordering the queue with the attacker address first
    await expect(
      vault.connect(attacker).processQueuedDeposits([attacker.address, user0.address, user1.address])
    ).to.be.revertedWithCustomError(vault, 'IVault__AssetsUnderMinimumAmount')
      .withArgs(1)

    // Processing the queue with the first over the minimum initial assets
    await vault.connect(attacker).processQueuedDeposits([user0.address, user1.address, attacker.address])

    const attackerAssetBalanceBefore = await asset.balanceOf(attacker.address)
    const attackerShares = await vault.balanceOf(attacker.address)
    await vault.connect(vaultController).startRound()
    await expect(vault.connect(attacker).redeem(attackerShares, attacker.address, attacker.address))
      .to.be.revertedWithCustomError(vault, 'IVault__ZeroAssets')

    const attackerAssetBalanceDiff = (await asset.balanceOf(attacker.address)).sub(attackerAssetBalanceBefore)
    expect(attackerAssetBalanceDiff).to.be.lte(1)
  })

  it('should not allow investorRatio to exceed DENOMINATOR', async () => {
    const investorRatio = ethers.BigNumber.from('10001')

    const STETHVault = await ethers.getContractFactory('STETHVault')
    const deployTransaction = STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address,
      investorRatio
    )

    await expect(deployTransaction).to.be.revertedWith('Investor ratio exceeds DENOMINATOR')
  })
})
