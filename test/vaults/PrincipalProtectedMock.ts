import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import createConfigurationManager from '../utils/createConfigurationManager'
import { feeExcluded } from '../utils/feeExcluded'
import { Asset, ConfigurationManager, InvestorActorMock, PrincipalProtectedMock, YieldSourceMock } from '../../typechain'

describe('PrincipalProtectedMock', () => {
  let asset: Asset, vault: PrincipalProtectedMock, yieldSource: YieldSourceMock,
    investor: InvestorActorMock, configuration: ConfigurationManager

  let user0: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress,
    user4: SignerWithAddress, vaultController: SignerWithAddress, user5: SignerWithAddress, user6: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, user2, vaultController, user3, user4, user5, user6] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    const Asset = await ethers.getContractFactory('Asset')
    asset = await Asset.deploy('Asset', 'AST')

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const PrincipalProtectedETHBull = await ethers.getContractFactory('PrincipalProtectedMock')
    vault = await PrincipalProtectedETHBull.deploy(
      configuration.address,
      asset.address,
      investor.address,
      yieldSource.address
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
    await asset.connect(user5).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user6).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('Reading functions', () => {
    it('should match maxWithdraw and real withdraw balances', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await asset.connect(user0).mint(user0Deposit)
      await asset.connect(user1).mint(user1Deposit)
      // Round 0
      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
      // Round 1
      await vault.connect(vaultController).startRound()
      await yieldSource.generateInterest(ethers.utils.parseEther('100'))

      const user0maxWithdraw = await vault.maxWithdraw(user0.address)
      const user1maxWithdraw = await vault.maxWithdraw(user1.address)

      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

      const user0AfterBalance = await asset.balanceOf(user0.address)
      const user1AfterBalance = await asset.balanceOf(user1.address)

      expect(user0maxWithdraw).to.be.equal(user0AfterBalance)
      expect(user1maxWithdraw).to.be.closeTo(user1AfterBalance, 1)
    })

    it('should match maxRedeem and real withdraw balances', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await asset.connect(user0).mint(user0Deposit)
      await asset.connect(user1).mint(user1Deposit)
      // Round 0
      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
      // Round 1
      await vault.connect(vaultController).startRound()
      await yieldSource.generateInterest(ethers.utils.parseEther('100'))

      const user0maxRedeem = await vault.maxRedeem(user0.address)
      const user1maxRedeem = await vault.maxRedeem(user1.address)

      const user0maxShares = await vault.balanceOf(user0.address)
      const user1maxShares = await vault.balanceOf(user1.address)

      expect(user0maxRedeem).to.be.equal(user0maxShares)
      expect(user1maxRedeem).to.be.equal(user1maxShares)
    })
  })

  it('should add collateral and receive shares', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assetAmount)

    // User0 deposits to vault
    await vault.connect(user0).deposit(assetAmount, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assetAmount)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assetAmount)

    // Process deposits
    const endRoundTx = vault.connect(vaultController).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRoundData').withArgs(0, 0, 0, assetAmount)
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.equal(assetAmount)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(
      vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot deposit between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(vaultController).endRound()
    await expect(
      vault.connect(user0).deposit(assetAmount, user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot processQueue After round started', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()
    await expect(vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
  })

  it('withdraws proportionally', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount.mul(2))
    await asset.connect(user1).mint(assetAmount)

    // Users deposits to vault
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(user1).deposit(assetAmount, user1.address)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assetAmount.mul(3))
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assetAmount.mul(2))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(assetAmount)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await asset.balanceOf(user0.address)).to.be.equal(feeExcluded(assetAmount.mul(2)))
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(feeExcluded(assetAmount))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('full cycle test case', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('100')
    await asset.connect(user0).mint(assetAmount)
    await asset.connect(user1).mint(assetAmount)

    // Round 0
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(assetAmount, user1.address)
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await investor.generatePremium(ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 3
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('70'))

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

    expect(await vault.totalSupply()).to.be.equal(0)
    expect(await vault.totalAssets()).to.be.equal(0)

    const expectedUser0Amount = feeExcluded('1495424836601307189542')
    const expectedUser1Amount = feeExcluded('104575163398692810458')

    expect(await asset.balanceOf(user0.address)).to.be.equal(expectedUser0Amount)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    expect(await asset.balanceOf(user1.address)).to.be.equal(expectedUser1Amount)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)

    expect(await vault.totalAssets()).to.be.equal(0)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()
  })

  it('underflow testcase', async () => {
  // This test will only work if InvestRatio = 50%
    const user0InitialBalance = ethers.utils.parseEther('500')
    const user1InitialBalance = ethers.utils.parseEther('100')
    const user2InitialBalance = ethers.utils.parseEther('6')
    const user3InitialBalance = ethers.utils.parseEther('10')
    const user4InitialBalance = ethers.utils.parseEther('8')

    await asset.connect(user0).mint(user0InitialBalance)
    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user0).deposit(user0InitialBalance.div(2), user0.address)

    await vault.connect(user0).deposit(user0InitialBalance.div(2), user0.address)

    await asset.connect(user1).mint(user1InitialBalance)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user1).deposit(user1InitialBalance, user1.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 2)
    await vault.connect(vaultController).startRound()

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)

    await asset.connect(user2).mint(user2InitialBalance)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user2).deposit(user2InitialBalance.div(3), user2.address)

    await asset.connect(user3).mint(user3InitialBalance)
    await asset.connect(user3).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user3).deposit(user3InitialBalance, user3.address)

    await vault.connect(user2).deposit(user2InitialBalance.div(3).mul(2), user2.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 2)
    await vault.connect(vaultController).startRound()

    await yieldSource.generateInterest(ethers.utils.parseEther('2'))

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()

    await vault.connect(user2).redeem(await vault.balanceOf(user2.address), user2.address, user2.address)

    await asset.connect(user4).mint(user4InitialBalance)
    await asset.connect(user4).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user4).deposit(user4InitialBalance, user4.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 1)
    await vault.connect(vaultController).startRound()

    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    await vault.connect(user3).redeem(await vault.balanceOf(user3.address), user3.address, user3.address)
    await vault.connect(user4).redeem(await vault.balanceOf(user4.address), user4.address, user4.address)

    // Vault checks
    expect(await vault.totalAssets()).to.be.equal(0)
    expect(await vault.totalSupply()).to.be.equal(0)

    // User checks
    expect(await asset.balanceOf(user0.address)).to.be.gte(feeExcluded(user0InitialBalance))
    expect(await asset.balanceOf(user1.address)).to.be.gte(feeExcluded(user1InitialBalance))
    expect(await asset.balanceOf(user2.address)).to.be.gte(feeExcluded(user2InitialBalance))
    expect(await asset.balanceOf(user3.address)).to.be.gte(feeExcluded(user3InitialBalance))
    expect(await asset.balanceOf(user4.address)).to.be.gte(feeExcluded(user4InitialBalance))

    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.balanceOf(user2.address)).to.be.equal(0)
    expect(await vault.balanceOf(user3.address)).to.be.equal(0)
    expect(await vault.balanceOf(user4.address)).to.be.equal(0)

    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user2.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user3.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user4.address)).to.be.equal(0)
  })

  it('Should remove less amount than initial deposited - break process deposits in two steps', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('1')
    const initialDeposit0 = assetAmount.mul(6)
    const initialDeposit1 = assetAmount.mul(1)
    const initialDeposit2 = assetAmount.mul(5)

    await asset.connect(user0).mint(initialDeposit0.add(initialDeposit1))
    await asset.connect(user1).mint(initialDeposit2)

    // Round 0
    await vault.connect(user0).deposit(initialDeposit0, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('8'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('2'))
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).startRound()
    await vault.connect(user0).deposit(initialDeposit1, user0.address)
    await vault.connect(user1).deposit(initialDeposit2, user1.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 1)
    await vault.connect(vaultController).processQueuedDeposits(0, 1)
    await vault.connect(vaultController).startRound()

    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

    expect(await asset.balanceOf(user1.address)).to.be.lte(initialDeposit2)
  })

  it('Should remove less amount than initial deposited - 5 consecutive deposits', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('1')
    const initialDeposit0 = assetAmount.mul(6)
    const initialDeposit1 = assetAmount.mul(1)
    const initialDeposit2 = assetAmount.mul(5)
    const initialDeposit3 = assetAmount.mul(3)
    const initialDeposit4 = assetAmount.mul(2)
    const initialDeposit5 = assetAmount.mul(2)

    await asset.connect(user0).mint(initialDeposit0.add(initialDeposit1))
    await asset.connect(user1).mint(initialDeposit2)
    await asset.connect(user2).mint(initialDeposit3)
    await asset.connect(user3).mint(initialDeposit4)
    await asset.connect(user4).mint(initialDeposit5)
    await asset.connect(user5).mint(initialDeposit5)

    // Round 0
    await vault.connect(user0).deposit(initialDeposit0, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('8'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('2'))
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).startRound()
    await vault.connect(user0).deposit(initialDeposit1, user0.address)
    await vault.connect(user1).deposit(initialDeposit2, user1.address)
    await vault.connect(user2).deposit(initialDeposit3, user2.address)
    await vault.connect(user3).deposit(initialDeposit4, user3.address)
    await vault.connect(user4).deposit(initialDeposit5, user4.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 5)
    await vault.connect(vaultController).startRound()

    await vault.connect(user4).redeem(await vault.balanceOf(user4.address), user4.address, user4.address)

    expect(await asset.balanceOf(user4.address)).to.be.lte(initialDeposit5)
  })

  it('Should remmove the same balances even if no processed queue happened during a round interval', async () => {
    // This test will only work if InvestRatio = 50%
    const user0Balance = ethers.utils.parseEther('100')
    const user1Balance = ethers.utils.parseEther('200')
    const user2Balance = ethers.utils.parseEther('300')
    const user3Balance = ethers.utils.parseEther('10003')

    await asset.connect(user0).mint(user0Balance)
    await asset.connect(user1).mint(user1Balance)
    await asset.connect(user2).mint(user2Balance)
    await asset.connect(user3).mint(user3Balance)

    // Round 0
    await vault.connect(user0).mint(user0Balance, user0.address)
    await vault.connect(user1).mint(user1Balance, user1.address)
    await vault.connect(user2).mint(user2Balance, user2.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    await vault.connect(vaultController).startRound()

    const user0Moment1maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment1maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment1maxWithdraw = await vault.maxWithdraw(user2.address)
    // console.log('MOMENT 1 - Should have the same amounts')
    expect(user0Moment1maxWithdraw).to.be.eq(feeExcluded(user0Balance))
    expect(user1Moment1maxWithdraw).to.be.eq(feeExcluded(user1Balance))
    expect(user2Moment1maxWithdraw).to.be.eq(feeExcluded(user2Balance))
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await yieldSource.generateInterest(ethers.utils.parseEther('100'))

    const user0Moment2maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment2maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment2maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 2 - Should have amounts greather than MOMENT 1')
    expect(user0Moment2maxWithdraw).to.be.gte(user0Moment1maxWithdraw)
    expect(user1Moment2maxWithdraw).to.be.gte(user1Moment1maxWithdraw)
    expect(user2Moment2maxWithdraw).to.be.gte(user2Moment1maxWithdraw)

    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')
    await vault.connect(user3).deposit(user3Balance, user3.address)

    const user0Moment3maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment3maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment3maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 3 - Should have same amounts of 2')
    expect(user0Moment3maxWithdraw).to.be.eq(user0Moment2maxWithdraw)
    expect(user1Moment3maxWithdraw).to.be.eq(user1Moment2maxWithdraw)
    expect(user2Moment3maxWithdraw).to.be.eq(user2Moment2maxWithdraw)

    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await vault.connect(vaultController).endRound()

    const user0Moment4maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment4maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment4maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 4 - Should have less amount than 3 -> transfered some funds to investor')
    expect(user0Moment4maxWithdraw).to.be.lte(user0Moment3maxWithdraw)
    expect(user1Moment4maxWithdraw).to.be.lte(user1Moment3maxWithdraw)
    expect(user2Moment4maxWithdraw).to.be.lte(user2Moment3maxWithdraw)
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await vault.connect(vaultController).startRound()

    const user0Moment5maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment5maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment5maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 5 - Should have same amount as MOMENT 4')
    expect(user0Moment5maxWithdraw).to.be.eq(user0Moment4maxWithdraw)
    expect(user1Moment5maxWithdraw).to.be.eq(user1Moment4maxWithdraw)
    expect(user2Moment5maxWithdraw).to.be.eq(user2Moment4maxWithdraw)

    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await investor.buyOptionsWithYield()

    const user0Moment6maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment6maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment6maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 6 - Should have same amount as MOMENT 5 and 4')
    expect(user0Moment6maxWithdraw).to.be.eq(user0Moment5maxWithdraw)
    expect(user1Moment6maxWithdraw).to.be.eq(user1Moment5maxWithdraw)
    expect(user2Moment6maxWithdraw).to.be.eq(user2Moment5maxWithdraw)
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await investor.generatePremium(ethers.utils.parseEther('600'))

    const user0Moment7maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment7maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment7maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 7 - Should have same amount as MOMENTS 6, 5, and 4')
    expect(user0Moment7maxWithdraw).to.be.eq(user0Moment6maxWithdraw)
    expect(user1Moment7maxWithdraw).to.be.eq(user1Moment6maxWithdraw)
    expect(user2Moment7maxWithdraw).to.be.eq(user2Moment6maxWithdraw)
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await vault.connect(vaultController).endRound()

    const user0Moment8maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment8maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment8maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log('MOMENT 8 - Should have more amount than MOMENT 7')
    expect(user0Moment8maxWithdraw).to.be.gt(user0Moment7maxWithdraw)
    expect(user1Moment8maxWithdraw).to.be.gt(user1Moment7maxWithdraw)
    expect(user2Moment8maxWithdraw).to.be.gt(user2Moment7maxWithdraw)
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    await vault.connect(vaultController).startRound()

    const user0Moment9maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment9maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment9maxWithdraw = await vault.maxWithdraw(user2.address)
    // console.log('MOMENT 9 - Should have the same amount as MOMENT 8')
    // console.log((await vault.maxWithdraw(user0.address)).toString())
    // console.log((await vault.maxWithdraw(user1.address)).toString())
    // console.log((await vault.maxWithdraw(user2.address)).toString())
    // console.log('----------------')

    expect(user0Moment9maxWithdraw).to.be.eq(user0Moment8maxWithdraw)
    expect(user1Moment9maxWithdraw).to.be.eq(user1Moment8maxWithdraw)
    expect(user2Moment9maxWithdraw).to.be.eq(user2Moment8maxWithdraw)

    const sharesAmount0 = await vault.balanceOf(user0.address)
    const sharesAmount1 = await vault.balanceOf(user1.address)
    const sharesAmount2 = await vault.balanceOf(user2.address)

    await vault.connect(user0).redeem(sharesAmount0, user0.address, user0.address)
    await vault.connect(user1).redeem(sharesAmount1, user1.address, user1.address)
    await vault.connect(user2).redeem(sharesAmount2, user2.address, user2.address)

    const user0Moment10Balance = await asset.balanceOf(user0.address)
    const user1Moment10Balance = await asset.balanceOf(user1.address)
    const user2Moment10Balance = await asset.balanceOf(user2.address)

    // console.log('MOMENT 10 - Should have the same amount as 8 and 9 minus fee')
    expect(user0Moment10Balance).to.be.lte(user0Moment9maxWithdraw)
    expect(user1Moment10Balance).to.be.lte(user1Moment9maxWithdraw)
    expect(user2Moment10Balance.sub(1)).to.be.lte(user2Moment9maxWithdraw)

    // console.log((await asset.balanceOf(user0.address)).toString())
    // console.log((await asset.balanceOf(user1.address)).toString())
    // console.log((await asset.balanceOf(user2.address)).toString())
    // console.log('----------------')
  })
})
