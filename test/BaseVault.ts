import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber, Signer } from 'ethers'

describe('BaseVault', () => {
  let asset: Contract, vault: Contract, yieldSource: Contract
  let user0: Signer, user1: Signer, user2: Signer, strategist: Signer
  let user0Address: string, user1Address: string, user2Address: string
  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, user2, strategist] = await ethers.getSigners()
    ;[user0Address, user1Address, user2Address] = await Promise.all([
      user0.getAddress(),
      user1.getAddress(),
      user2.getAddress()
    ])
    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    const MockAsset = await ethers.getContractFactory('Asset')
    asset = await MockAsset.deploy()

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const Vault = await ethers.getContractFactory('YieldVaultMock', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await Vault.deploy(asset.address, await strategist.getAddress(), yieldSource.address)

    await expect(vault.deployTransaction)
      .to.emit(vault, 'StartRound').withArgs(0, 0)

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(strategist).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    expect(await asset.balanceOf(user0Address)).to.be.equal(assets)

    // User0 deposits to vault
    await vault.connect(user0).deposit(assets)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0Address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(assets)

    // Process deposits
    // Since Round 0 started upon deployment, it should end the exact same round number "0"
    const endRoundTx = vault.connect(strategist).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRound').withArgs(0)
    const depositProcessingTx = vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    const expectedShares = assets
    await expect(depositProcessingTx).to.emit(vault, 'DepositProcessed').withArgs(user0Address, 1, assets, expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0Address)).to.be.equal(expectedShares)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    // Start round
    await vault.connect(strategist).startRound()
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(vault.connect(user0).withdraw()).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot deposit between a round\'s end and the beginning of the next', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(strategist).endRound()
    await expect(vault.connect(user0).deposit(assets)).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot processQueue After round started', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).startRound()
    await expect(vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
  })

  it('withdraws proportionally', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    // Users deposits to vault
    await vault.connect(user0).deposit(assets)
    await vault.connect(user0).deposit(assets)
    await vault.connect(user1).deposit(assets)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets.mul(3))
    expect(await asset.balanceOf(user0Address)).to.be.equal(0)
    expect(await asset.balanceOf(user1Address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(assets.mul(2))
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(assets)

    // Process deposits
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(strategist).startRound()

    // User0 withdraws
    await vault.connect(user0).withdraw()
    expect(await asset.balanceOf(user0Address)).to.be.equal(assets.mul(2))
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).withdraw()
    expect(await asset.balanceOf(user1Address)).to.be.equal(assets)
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('redeposit test case', async () => {
    const assets = ethers.utils.parseEther('100')
    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
    // Round 0
    await vault.connect(user0).deposit(assets)
    await vault.connect(user1).deposit(assets)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(strategist).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('100'))
    await vault.connect(user0).deposit(assets)

     // Accruing yield
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    await vault.connect(strategist).startRound()

    await yieldSource.generateInterest(ethers.utils.parseEther('200')) // Accruing yield

    const expectedUser0Amount = ethers.utils.parseEther('375')
    const expectedUser1Amount = ethers.utils.parseEther('225')

    await vault.connect(user0).withdraw()
    expect(await asset.balanceOf(user0Address)).to.be.equal(expectedUser0Amount)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    await vault.connect(user1).withdraw()
    expect(await asset.balanceOf(user1Address)).to.be.equal(expectedUser1Amount)
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(0)

    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
  })
})
