import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import createConfigurationManager from '../utils/createConfigurationManager'
import { feeExcluded } from '../utils/feeExcluded'
import { Asset, ConfigurationManager, YieldSourceMock, YieldVaultMock } from '../../typechain'
import { signERC2612Permit } from 'eth-permit'

describe('BaseVault', () => {
  let asset: Asset, vault: YieldVaultMock, yieldSource: YieldSourceMock, configuration: ConfigurationManager

  let user0: SignerWithAddress, user1: SignerWithAddress,
    user2: SignerWithAddress, vaultController: SignerWithAddress, proxy: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, user2, vaultController, proxy] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    const Asset = await ethers.getContractFactory('Asset')
    asset = await Asset.deploy('Asset', 'AST')

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const Vault = await ethers.getContractFactory('YieldVaultMock')
    vault = await Vault.deploy(
      configuration.address,
      asset.address,
      yieldSource.address
    )

    await expect(vault.deployTransaction)
      .to.emit(vault, 'StartRound').withArgs(0, 0)

    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('ERC20 checks', () => {
    it('has a name', async () => {
      expect(await vault.name()).to.be.equal(`Pods Yield ${await asset.symbol()}`)
    })

    it('has a symbol', async () => {
      expect(await vault.symbol()).to.be.equal(`py${await asset.symbol()}`)
    })

    it('has decimals', async () => {
      expect(await vault.decimals()).to.be.equal(await asset.decimals())
    })
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
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
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
      // The last user receives dust from the contract
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
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
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

    it('both maxDeposit and maxMint should be MAX_UINT', async () => {
      expect(await vault.maxDeposit(user0.address)).to.be.equal(ethers.constants.MaxUint256)
      expect(await vault.maxMint(user0.address)).to.be.equal(ethers.constants.MaxUint256)
    })

    it('should match previewWithdraw and real withdraw with shares', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await asset.connect(user0).mint(user0Deposit)
      await asset.connect(user1).mint(user1Deposit)
      // Round 0
      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      // Round 1
      await vault.connect(vaultController).startRound()
      await yieldSource.generateInterest(ethers.utils.parseEther('100'))

      const user0previewShares = await vault.previewWithdraw(assets)

      const balanceUser0Before = await asset.balanceOf(user0.address)
      await vault.connect(user0).redeem(user0previewShares, user0.address, user0.address)
      const balanceUser0After = await asset.balanceOf(user0.address)
      const withdrawnBalance = balanceUser0After.sub(balanceUser0Before)

      expect(withdrawnBalance).to.be.equal(assets)
    })
    it('should match previewRedeem and real withdraw with assets', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await asset.connect(user0).mint(user0Deposit)
      await asset.connect(user1).mint(user1Deposit)
      // Round 0
      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
      // Round 1
      await vault.connect(vaultController).startRound()
      await yieldSource.generateInterest(ethers.utils.parseEther('100'))

      const user0previewRedeem = await vault.previewRedeem(await vault.balanceOf(user0.address))

      const balanceUser0Before = await asset.balanceOf(user0.address)
      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      const balanceUser0After = await asset.balanceOf(user0.address)
      const withdrawnBalance = balanceUser0After.sub(balanceUser0Before)
      expect(withdrawnBalance).to.be.equal(user0previewRedeem)
    })
  })

  it('has the max fee ratio capped to MAX_WITHDRAW_FEE', async () => {
    // Setting fees to 100%
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), 10000)

    expect(await vault.withdrawFeeRatio()).to.be.equal(await vault.MAX_WITHDRAW_FEE())
  })

  it('deposit assets and receive shares', async () => {
    const assets = ethers.utils.parseEther('10')
    const expectedShares = assets

    await asset.connect(user0).mint(assets)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assets)

    // User0 deposits to vault
    await vault.connect(user0).deposit(assets, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)
    expect(await vault.totalIdleAssets()).to.be.equal(assets)
    expect(await vault.isProcessingDeposits()).to.be.equal(false)

    // Process deposits
    // Since Round 0 started upon deployment, it should end the exact same round number "0"
    const endRoundTx = vault.connect(vaultController).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRound').withArgs(0)
    expect(await vault.isProcessingDeposits()).to.be.equal(true)
    const depositProcessingTx = vault.connect(vaultController).processQueuedDeposits([user0.address])
    await expect(depositProcessingTx).to.emit(vault, 'DepositProcessed').withArgs(user0.address, 1, assets, expectedShares)
    expect(await vault.assetsOf(user0.address)).to.be.equal(assets)
    expect(await vault.totalSupply()).to.be.equal(expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.equal(expectedShares)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)
    expect(await vault.totalIdleAssets()).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
    expect(await vault.totalAssets()).to.be.equal(assets)
    expect(await vault.assetsOf(user0.address)).to.be.equal(assets)
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('mint shares and sending assets', async () => {
    const assets = ethers.utils.parseEther('10')
    const expectedShares = assets

    await asset.connect(user0).mint(assets)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assets)

    // User0 deposits to vault
    await vault.connect(user0).mint(assets, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)
    expect(await vault.totalIdleAssets()).to.be.equal(assets)
    expect(await vault.isProcessingDeposits()).to.be.equal(false)

    // Process deposits
    // Since Round 0 started upon deployment, it should end the exact same round number "0"
    const endRoundTx = vault.connect(vaultController).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRound').withArgs(0)
    expect(await vault.isProcessingDeposits()).to.be.equal(true)
    const depositProcessingTx = vault.connect(vaultController).processQueuedDeposits([user0.address])
    await expect(depositProcessingTx).to.emit(vault, 'DepositProcessed').withArgs(user0.address, 1, assets, expectedShares)
    expect(await vault.totalSupply()).to.be.equal(expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.equal(expectedShares)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)
    expect(await vault.totalIdleAssets()).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
    expect(await vault.totalAssets()).to.be.equal(assets)
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot call controller functions without permission', async () => {
    await expect(vault.connect(user0).startRound()).to.be.revertedWith('IVault__CallerIsNotTheController()')
    await expect(vault.connect(user0).endRound()).to.be.revertedWith('IVault__CallerIsNotTheController()')
  })

  describe('Lifecycle', () => {
    it('cannot redeem between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      const shares = await vault.balanceOf(user0.address)

      await expect(
        vault.connect(user0).redeem(shares, user0.address, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])

      await expect(
        vault.connect(user0).withdraw(assets, user0.address, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot deposit between a round\'s end and the beginning of the next', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets)
      await vault.connect(vaultController).endRound()
      await expect(
        vault.connect(user0).deposit(assets, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')

      const permit = await signERC2612Permit(
        user0,
        asset.address,
        user0.address,
        vault.address,
        assets.toString()
      )

      await expect(
        vault.connect(user0).depositWithPermit(
          assets,
          user0.address,
          permit.deadline,
          permit.v,
          permit.r,
          permit.s
        )
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot mint between a round\'s end and the beginning of the next', async () => {
      const shares = ethers.utils.parseEther('10')
      const expectedAssets = await vault.previewMint(shares)

      await asset.connect(user0).mint(expectedAssets)
      await vault.connect(vaultController).endRound()
      await expect(
        vault.connect(user0).mint(shares, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')

      const permit = await signERC2612Permit(
        user0,
        asset.address,
        user0.address,
        vault.address,
        expectedAssets.toString()
      )

      await expect(
        vault.connect(user0).mintWithPermit(
          shares,
          user0.address,
          permit.deadline,
          permit.v,
          permit.r,
          permit.s
        )
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot processQueue After round started', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).startRound()
      await expect(
        vault.connect(vaultController).processQueuedDeposits([user0.address])
      ).to.be.revertedWith('IVault__NotProcessingDeposits()')
    })

    it('cannot start or end rounds twice', async () => {
      await vault.connect(vaultController).endRound()
      await expect(vault.connect(vaultController).endRound())
        .to.be.revertedWith('IVault__AlreadyProcessingDeposits()')

      await vault.connect(vaultController).startRound()
      await expect(vault.connect(vaultController).startRound())
        .to.be.revertedWith('IVault__NotProcessingDeposits()')
    })

    it('after a week, anyone can start the round', async () => {
      await vault.connect(vaultController).endRound()
      let startRoundTx = vault.connect(user0).startRound()
      await expect(startRoundTx).to.be.revertedWith('IVault__CallerIsNotTheController')

      // fast-forward a week
      const block = await ethers.provider.getBlock('latest')
      await ethers.provider.send('evm_mine', [block.timestamp + 604800])

      startRoundTx = vault.connect(user0).startRound()
      await expect(startRoundTx).to.emit(vault, 'StartRound')
    })
  })

  describe('Proxy', () => {
    it('can deposit and withdraw on behalf', async () => {
      const assets = ethers.utils.parseEther('10')
      const expectedShares = assets

      expect(await asset.balanceOf(user0.address)).to.be.equal(0)
      await asset.connect(proxy).mint(assets)
      await asset.connect(proxy).approve(vault.address, assets)
      await vault.connect(proxy).deposit(assets, user0.address)
      expect(await vault.depositQueueSize()).to.be.equal(1)
      expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      expect(await vault.totalSupply()).to.be.equal(expectedShares)
      expect(await vault.depositQueueSize()).to.be.equal(0)
      expect(await vault.balanceOf(user0.address)).to.be.equal(expectedShares)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

      await vault.connect(vaultController).startRound()
      expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(0)
      const snapshotId = await ethers.provider.send('evm_snapshot', [])

      // Spending allowance
      await vault.connect(user0).approve(proxy.address, expectedShares)
      expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(expectedShares)
      await vault.connect(proxy).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(0)
      expect(await asset.balanceOf(user0.address)).to.be.equal(feeExcluded(assets))

      // If MaxUint256 allowance was given, it should not be spent
      await ethers.provider.send('evm_revert', [snapshotId])
      await vault.connect(user0).approve(proxy.address, ethers.constants.MaxUint256)
      expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(ethers.constants.MaxUint256)
      await vault.connect(proxy).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(ethers.constants.MaxUint256)
      expect(await asset.balanceOf(user0.address)).to.be.equal(feeExcluded(assets))
    })

    it('cannot withdraw on behalf without allowance', async () => {
      const assets = ethers.utils.parseEther('10')
      const expectedShares = assets

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      expect(await vault.depositQueueSize()).to.be.equal(1)
      expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      expect(await vault.totalSupply()).to.be.equal(expectedShares)
      expect(await vault.depositQueueSize()).to.be.equal(0)
      expect(await vault.balanceOf(user0.address)).to.be.equal(expectedShares)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

      await vault.connect(vaultController).startRound()
      await expect(
        vault.connect(proxy).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      ).to.be.revertedWith('ERC20: insufficient allowance')
    })
  })

  describe('Cap', () => {
    it('cannot exceed cap', async () => {
      const cap = ethers.utils.parseEther('5')
      const assets = ethers.utils.parseEther('10')

      await configuration.setCap(vault.address, cap)
      await asset.connect(user0).mint(assets)
      await expect(vault.connect(user0).deposit(assets, user0.address))
        .to.be.revertedWith('ERC4626: deposit more than max')
    })

    it('maxMint and maxDeposit should account for the cap', async () => {
      const cap = ethers.utils.parseEther('5000000000')

      expect(await vault.maxMint(user0.address)).to.be.equal(ethers.constants.MaxUint256)
      expect(await vault.maxDeposit(user0.address)).to.be.equal(ethers.constants.MaxUint256)

      await configuration.setCap(vault.address, cap)
      expect(await vault.maxMint(user0.address)).to.be.equal(cap)
      expect(await vault.maxDeposit(user0.address)).to.be.equal(cap)

      const assets = ethers.utils.parseEther('3')
      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      expect(await vault.maxMint(user0.address)).to.be.equal(cap.sub(assets))
      expect(await vault.maxDeposit(user0.address)).to.be.equal(cap.sub(assets))

      await asset.connect(user1).mint(cap.sub(assets))
      await vault.connect(user1).deposit(cap.sub(assets), user1.address)
      expect(await vault.maxMint(user0.address)).to.be.equal(0)
      expect(await vault.maxDeposit(user0.address)).to.be.equal(0)
    })

    it('restores cap after withdrawing', async () => {
      const assets = ethers.utils.parseEther('10')

      // Using vault with cap
      await asset.connect(user0).mint(assets)
      const cap = ethers.utils.parseEther('10')
      await configuration.setCap(vault.address, cap)

      await vault.connect(user0).deposit(assets, user0.address)

      expect(await vault.availableCap()).to.be.equal(0)
      expect(await vault.spentCap()).to.be.equal(cap)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      await vault.connect(vaultController).startRound()
      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)

      expect(await vault.availableCap()).to.be.equal(cap)
      expect(await vault.spentCap()).to.be.equal(0)

      // Using vault without cap
      await asset.connect(user0).mint(assets)
      await configuration.setCap(vault.address, 0)

      await vault.connect(user0).deposit(assets, user0.address)

      expect(await vault.availableCap()).to.be.equal(ethers.constants.MaxUint256)
      expect(await vault.spentCap()).to.be.equal(assets)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      await vault.connect(vaultController).startRound()
      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)

      expect(await vault.availableCap()).to.be.equal(ethers.constants.MaxUint256)
      expect(await vault.spentCap()).to.be.equal(assets)
    })
  })

  describe('DepositQueue', () => {
    it('shows the queued deposit addresses', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await asset.connect(user1).mint(assets)
      await vault.connect(user1).deposit(assets, user1.address)
      await asset.connect(user2).mint(assets)
      await vault.connect(user2).deposit(assets, user2.address)

      expect(await vault.queuedDeposits()).to.be.deep.equal([
        user0.address,
        user1.address,
        user2.address
      ])

      // Remove users from queue
      await vault.connect(user0).refund()
      await vault.connect(user2).refund()

      expect(await vault.queuedDeposits()).to.be.deep.equal([
        user1.address
      ])

      // A new deposit should not change the queue
      await vault.connect(user2).deposit(assets, user2.address)

      expect(await vault.queuedDeposits()).to.be.deep.equal([
        user1.address,
        user2.address
      ])
    })

    it('can refund from the queue', async () => {
      const assets = ethers.utils.parseEther('10')
      let cap = ethers.utils.parseEther('30')

      await asset.connect(user0).mint(assets)
      await asset.connect(user1).mint(assets)
      await asset.connect(user2).mint(assets)

      // Users deposits to vault
      await configuration.setCap(vault.address, cap)
      await vault.connect(user0).deposit(assets, user0.address)
      expect(await vault.availableCap()).to.be.equal(cap.sub(assets))
      cap = cap.sub(assets)
      await vault.connect(user1).deposit(assets, user1.address)
      expect(await vault.availableCap()).to.be.equal(cap.sub(assets))
      cap = cap.sub(assets)
      await vault.connect(user2).deposit(assets, user2.address)
      expect(await vault.availableCap()).to.be.equal(cap.sub(assets))
      cap = cap.sub(assets)
      expect(await vault.depositQueueSize()).to.be.equal(3)
      expect(await vault.totalIdleAssets()).to.be.equal(assets.mul(3))

      expect(await asset.balanceOf(vault.address)).to.be.equal(assets.mul(3))
      expect(await asset.balanceOf(user0.address)).to.be.equal(0)
      expect(await asset.balanceOf(user1.address)).to.be.equal(0)
      expect(await asset.balanceOf(user2.address)).to.be.equal(0)

      expect(await vault.balanceOf(user0.address)).to.be.equal(0)
      expect(await vault.balanceOf(user1.address)).to.be.equal(0)
      expect(await vault.balanceOf(user2.address)).to.be.equal(0)

      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)
      expect(await vault.idleAssetsOf(user1.address)).to.be.equal(assets)
      expect(await vault.idleAssetsOf(user2.address)).to.be.equal(assets)

      const refundTx = vault.connect(user1).refund()
      await expect(refundTx).to.emit(vault, 'DepositRefunded')
        .withArgs(user1.address, await vault.currentRoundId(), assets)

      cap = cap.add(assets)
      expect(await vault.availableCap()).to.be.equal(cap)
      expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)
      expect(await asset.balanceOf(user1.address)).to.be.equal(assets)
      expect(await vault.depositQueueSize()).to.be.equal(2)
      expect(await asset.balanceOf(vault.address)).to.be.equal(assets.mul(2))
      expect(await vault.totalIdleAssets()).to.be.equal(assets.mul(2))

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address, user2.address])

      expect(await vault.balanceOf(user0.address)).to.be.equal(assets)
      expect(await vault.balanceOf(user1.address)).to.be.equal(0)
      expect(await vault.balanceOf(user2.address)).to.be.equal(assets)
    })

    it('cannot refund if a user has no deposited assets', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets.mul(2))
      await asset.connect(user1).mint(assets)
      await asset.connect(user2).mint(assets)

      // Users deposits to vault
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(user2).deposit(assets, user2.address)
      expect(await vault.totalIdleAssets()).to.be.equal(assets.mul(3))
      expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)

      await expect(vault.connect(user1).refund()).to.be.revertedWith('IVault__ZeroAssets')

      expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)
      expect(await vault.totalIdleAssets()).to.be.equal(assets.mul(3))
      expect(await asset.balanceOf(user1.address)).to.be.equal(assets)
    })

    it('should behave equally if someone tries to mint 0 shares', async () => {
      const assets = ethers.utils.parseEther('10')

      await asset.connect(user0).mint(assets.mul(2))
      await asset.connect(user1).mint(assets.mul(2))
      await asset.connect(user2).mint(assets)

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
      expect(idleAssetsUser0).to.be.equal(assets)
      expect(idleAssetsUser1).to.be.equal(previewMintedAssets)

      const totalIdleAssets = await vault.totalIdleAssets()

      expect(totalIdleAssets).to.be.equal(previewMintedAssets.add(assets).add(assets))

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

  describe('Permit', () => {
    it('can deposit with permits', async () => {
      const assets = ethers.utils.parseEther('10')
      const expectedShares = await vault.previewDeposit(assets)

      await asset.connect(user0).mint(assets)
      const permit = await signERC2612Permit(
        user0,
        asset.address,
        user0.address,
        vault.address,
        assets.toString()
      )

      await vault.connect(user0).depositWithPermit(
        assets,
        user0.address,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      )
      expect(await vault.depositQueueSize()).to.be.equal(1)
      expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      expect(await vault.totalSupply()).to.be.equal(expectedShares)
      expect(await vault.depositQueueSize()).to.be.equal(0)
      expect(await vault.balanceOf(user0.address)).to.be.equal(expectedShares)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)
    })

    it('can mint with permits', async () => {
      const shares = ethers.utils.parseEther('10')
      const expectedAssets = await vault.previewMint(shares)

      await asset.connect(user0).mint(expectedAssets)
      const permit = await signERC2612Permit(
        user0,
        asset.address,
        user0.address,
        vault.address,
        shares.toString()
      )

      await vault.connect(user0).mintWithPermit(
        shares,
        user0.address,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      )
      expect(await vault.depositQueueSize()).to.be.equal(1)
      expect(await asset.balanceOf(vault.address)).to.be.equal(expectedAssets)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(expectedAssets)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      expect(await vault.totalSupply()).to.be.equal(shares)
      expect(await vault.depositQueueSize()).to.be.equal(0)
      expect(await vault.balanceOf(user0.address)).to.be.equal(shares)
      expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)
    })
  })

  describe('Migration', () => {
    it('migrates assets from one vault to the other', async () => {
      const assets = ethers.utils.parseEther('100')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      await vault.connect(vaultController).startRound()
      const shares = await vault.balanceOf(user0.address)

      const Vault = await ethers.getContractFactory('YieldVaultMock')
      const newVault = await Vault.deploy(
        configuration.address,
        asset.address,
        yieldSource.address
      )

      await configuration.setAllowedVault(newVault.address, true)

      expect(await vault.assetsOf(user0.address)).to.be.equal(assets)
      expect(await newVault.idleAssetsOf(user0.address)).to.be.equal(0)

      const migrationTx = vault.connect(user0).migrate(newVault.address)
      await expect(migrationTx)
        .to.emit(vault, 'Migrated')
        .withArgs(user0.address, vault.address, newVault.address, feeExcluded(assets), shares)

      expect(await vault.assetsOf(user0.address)).to.be.equal(0)
      expect(await newVault.idleAssetsOf(user0.address)).to.be.equal(feeExcluded(assets))
    })

    it('should not migrate to disallowed vaults', async () => {
      const assets = ethers.utils.parseEther('100')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      await vault.connect(vaultController).startRound()

      const Vault = await ethers.getContractFactory('YieldVaultMock')
      const newVault = await Vault.deploy(
        configuration.address,
        asset.address,
        yieldSource.address
      )

      const migrationTx = vault.connect(user0).migrate(newVault.address)
      await expect(migrationTx)
        .to.be.revertedWith('IVault__MigrationNotAllowed')
    })

    it('should not migrate to vaults with different assets', async () => {
      const assets = ethers.utils.parseEther('100')

      await asset.connect(user0).mint(assets)
      await vault.connect(user0).deposit(assets, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits([user0.address])
      await vault.connect(vaultController).startRound()

      const Asset = await ethers.getContractFactory('Asset')
      const Vault = await ethers.getContractFactory('YieldVaultMock')
      const newAsset = await Asset.deploy('Asset', 'AST')
      const newVault = await Vault.deploy(
        configuration.address,
        newAsset.address,
        yieldSource.address
      )

      await configuration.setAllowedVault(newVault.address, true)

      const migrationTx = vault.connect(user0).migrate(newVault.address)
      await expect(migrationTx)
        .to.be.revertedWith('IVault__MigrationNotAllowed')
    })
  })

  it('cannot redeem shares that result in zero assets', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address])
    await vault.connect(vaultController).startRound()

    await expect(
      vault.connect(user0).redeem(0, user0.address, user0.address)
    ).to.be.revertedWith('IVault__ZeroAssets()')
  })

  it('withdraws proportionally', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    // Users deposits to vault
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user1).deposit(assets, user1.address)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets.mul(3))
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(assets)

    // Process deposits
    await vault.connect(vaultController).endRound()
    expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.assetsOf(user1.address)).to.be.equal(assets)
    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
    expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.assetsOf(user1.address)).to.be.equal(assets)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    const expectedUser0Shares = ethers.utils.parseEther('20')
    expect(await vault.balanceOf(user0.address)).to.be.equal(expectedUser0Shares)
    const expectedUser1Shares = ethers.utils.parseEther('10')
    expect(await vault.balanceOf(user1.address)).to.be.equal(expectedUser1Shares)
    expect(await vault.totalSupply()).to.be.equal(expectedUser0Shares.add(expectedUser1Shares))

    // Starts round 1
    await vault.connect(vaultController).startRound()
    expect(await vault.assetsOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.assetsOf(user1.address)).to.be.equal(assets)

    // User1 withdraws
    const sharesToBeBurned = await vault.previewWithdraw(assets)

    // burn shares
    const balanceBefore = await asset.balanceOf(user0.address)
    await vault.connect(user0).redeem(sharesToBeBurned, user0.address, user0.address)
    const balanceAfter = await asset.balanceOf(user0.address)
    const balanceRemoved = balanceAfter.sub(balanceBefore)
    expect(balanceRemoved).to.be.eq(assets.add(1))

    // User0 withdraws
    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    const user1Shares = await vault.balanceOf(user1.address)

    const assetsToBeWithdrawnUser1 = feeExcluded(assets)
    const sharesToBeBurnedUser1 = await vault.previewWithdraw(assetsToBeWithdrawnUser1)

    expect(sharesToBeBurnedUser1).to.be.equal(user1Shares)

    await vault.connect(user1).redeem(user1Shares, user1.address, user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(feeExcluded(assets))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('redeposit test case', async () => {
    const assets = ethers.utils.parseEther('100')
    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
    // Round 0
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user1).deposit(assets, user1.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('100'))
    await vault.connect(user0).deposit(assets, user0.address)

    // Accruing yield
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits([user0.address, user1.address])
    // expect(await vault.previewDeposit(user0Address)).to.be.equal(expectedShares)
    await vault.connect(vaultController).startRound()

    await yieldSource.generateInterest(ethers.utils.parseEther('200')) // Accruing yield

    const expectedUser0Amount = feeExcluded(ethers.utils.parseEther('375'))
    const expectedUser1Amount = feeExcluded(ethers.utils.parseEther('225'))

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await asset.balanceOf(user0.address)).to.be.equal(expectedUser0Amount)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(expectedUser1Amount)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)

    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
  })
})
