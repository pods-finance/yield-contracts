import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Signer } from 'ethers'

describe('StrategyVault', () => {
  let underlying: Contract, vault: Contract
  let user0: Signer, user1: Signer, strategist: Signer

  before(async () => {
    [, user0, user1, strategist] = await ethers.getSigners()
    const Collateral = await ethers.getContractFactory('Underlying')
    underlying = await Collateral.deploy()

    const Vault = await ethers.getContractFactory('StrategyVault')
    vault = await Vault.deploy(underlying.address, await strategist.getAddress())
  })

  afterEach(async () => {
    await underlying.connect(user0).burn(await underlying.balanceOf(await user0.getAddress()))
    await underlying.connect(user1).burn(await underlying.balanceOf(await user1.getAddress()))
    await underlying.connect(strategist).burn(await underlying.balanceOf(await strategist.getAddress()))
  })

  it('should add collateral and receive shares', async () => {
    await underlying.connect(user0)
      .approve(vault.address, ethers.constants.MaxUint256)

    const underlyingAmount = ethers.utils.parseEther('10')

    await underlying.connect(user0).mint(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress()))
      .to.be.equal(underlyingAmount)

    await vault.connect(user0).deposit(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(0)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount)

    const [user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(underlyingAmount)

    // await vault.connect(user0).withdraw()
    // expect(await underlying.balanceOf(await user0.getAddress()))
    //   .to.be.equal(underlyingAmount)
    // expect(await vault.unlockedSharesOf(await user0.getAddress()))
    //   .to.be.equal(0)
  })

  it('withdraws proportionally', async () => {
    // await underlying.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    // await underlying.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    //
    // const underlyingAmount = ethers.utils.parseEther('10')
    // await underlying.connect(user0).mint(underlyingAmount.mul(2))
    // await underlying.connect(user1).mint(underlyingAmount)
    //
    // await vault.connect(user0).deposit(underlyingAmount)
    // await vault.connect(user0).deposit(underlyingAmount)
    // await vault.connect(user1).deposit(underlyingAmount)
    // expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount.mul(3))
    // expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(0)
    // expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(0)
    //
    // expect(await vault.unlockedSharesOf(await user0.getAddress())).to.be.equal(underlyingAmount.mul(2))
    // expect(await vault.unlockedSharesOf(await user1.getAddress())).to.be.equal(underlyingAmount)
    //
    // await vault.connect(user0).withdraw()
    // expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(underlyingAmount.mul(2))
    // await vault.connect(user1).withdraw()
    // expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(underlyingAmount)
    //
    // expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })
})
