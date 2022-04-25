import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber, Signer } from 'ethers'

describe('BaseVault', () => {
  let underlying: Contract, vault: Contract
  let user0: Signer, user1: Signer, strategist: Signer
  let user0Address: string, user1Address: string
  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, strategist] = await ethers.getSigners()
    ;[user0Address, user1Address] = await Promise.all([
      user0.getAddress(),
      user1.getAddress()
    ])
    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    const Underlying = await ethers.getContractFactory('Underlying')
    underlying = await Underlying.deploy()

    const Vault = await ethers.getContractFactory('BaseVault', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await Vault.deploy(underlying.address, await strategist.getAddress())

    await underlying.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await underlying.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await underlying.connect(strategist).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const underlyingAmount = ethers.utils.parseEther('10')

    await underlying.connect(user0).mint(underlyingAmount)
    expect(await underlying.balanceOf(user0Address)).to.be.equal(underlyingAmount)

    // User0 deposits to vault
    await vault.connect(user0).deposit(underlyingAmount)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await underlying.balanceOf(user0Address)).to.be.equal(0)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(underlyingAmount)

    // Process deposits
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0Address)).to.be.equal(underlyingAmount)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    // Start round
    await vault.connect(strategist).startRound()
    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const underlyingAmount = ethers.utils.parseEther('10')

    await underlying.connect(user0).mint(underlyingAmount)
    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    await vault.connect(strategist).endRound(await underlying.balanceOf(await strategist.getAddress()))

    await expect(vault.connect(user0).withdraw()).to.be.revertedWith('IVault__NotInWithdrawPeriod()')
  })

  it('withdraws proportionally', async () => {
    const underlyingAmount = ethers.utils.parseEther('10')
    await underlying.connect(user0).mint(underlyingAmount.mul(2))
    await underlying.connect(user1).mint(underlyingAmount)

    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user1).deposit(underlyingAmount)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount.mul(3))
    expect(await underlying.balanceOf(user0Address)).to.be.equal(0)
    expect(await underlying.balanceOf(user1Address)).to.be.equal(0)

    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(underlyingAmount.mul(2))

    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(underlyingAmount)

    await vault.connect(strategist).startRound()
    await vault.connect(strategist).endRound(await underlying.balanceOf(await strategist.getAddress()))

    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    await vault.connect(user0).withdraw()
    expect(await underlying.balanceOf(user0Address)).to.be.equal(underlyingAmount.mul(2))
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    await vault.connect(user1).withdraw()
    expect(await underlying.balanceOf(user1Address)).to.be.equal(underlyingAmount)
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(0)

    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })

  it('redeposit test case', async () => {
    const underlyingAmount = ethers.utils.parseEther('100')
    await underlying.connect(user0).mint(underlyingAmount.mul(2))
    await underlying.connect(user1).mint(underlyingAmount)

    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user1).deposit(underlyingAmount)

    let user0UnlockedShares: BigNumber, user0LockedShares: BigNumber,
      user1UnlockedShares: BigNumber, user1LockedShares: BigNumber

    // Round 1
    await vault.connect(strategist).startRound()
    await underlying.connect(strategist).mint(underlyingAmount) // Accruing yield

    await vault.connect(strategist).endRound(underlyingAmount.mul(3))

    // Round 2
    await vault.connect(user0).deposit(underlyingAmount)

    await vault.connect(strategist).startRound()
    await underlying.connect(strategist).mint(underlyingAmount.mul(2)) // Accruing yield
    await vault.connect(strategist).endRound(underlyingAmount.mul(6))

    const expectedUser0Amount = ethers.utils.parseEther('375')
    const expectedUser1Amount = ethers.utils.parseEther('225')

    await vault.connect(user0).withdraw()
    expect(await underlying.balanceOf(user0Address)).to.be.equal(expectedUser0Amount)
    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(user0Address)
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(0)

    await vault.connect(user1).withdraw()
    expect(await underlying.balanceOf(user1Address)).to.be.equal(expectedUser1Amount)
    ;[user1UnlockedShares, user1LockedShares] = await vault.sharesOf(user1Address)
    expect(user1UnlockedShares).to.be.equal(0)
    expect(user1LockedShares).to.be.equal(0)

    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })
})
