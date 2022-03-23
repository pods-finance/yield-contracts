import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Signer } from 'ethers'

describe('Vault', () => {
  let underlying: Contract, vault: Contract
  let user0: Signer, user1: Signer

  before(async () => {
    [, user0, user1] = await ethers.getSigners()
    const Collateral = await ethers.getContractFactory('Underlying')
    underlying = await Collateral.deploy()

    const Vault = await ethers.getContractFactory('Vault')
    vault = await Vault.deploy('Vault Shares', 'VLT', underlying.address)
  })

  afterEach(async () => {
    await underlying.connect(user0).burn(await underlying.balanceOf(await user0.getAddress()))
    await underlying.connect(user1).burn(await underlying.balanceOf(await user1.getAddress()))
  })

  it('should add collateral and receive shares', async () => {
    await underlying.connect(user0)
      .approve(vault.address, ethers.constants.MaxUint256)

    const underlyingAmount = ethers.utils.parseEther('10')

    await underlying.connect(user0).mint(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress()))
      .to.be.equal(underlyingAmount)

    await vault.connect(user0).stake(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress()))
      .to.be.equal(0)
    expect(await vault.balanceOf(await user0.getAddress()))
      .to.be.equal(underlyingAmount)

    await vault.connect(user0).claim()
    expect(await underlying.balanceOf(await user0.getAddress()))
      .to.be.equal(underlyingAmount)
    expect(await vault.balanceOf(await user0.getAddress()))
      .to.be.equal(0)
  })

  it('withdraws proportionally', async () => {
    await underlying.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await underlying.connect(user1).approve(vault.address, ethers.constants.MaxUint256)

    const underlyingAmount = ethers.utils.parseEther('10')
    await underlying.connect(user0).mint(underlyingAmount.mul(2))
    await underlying.connect(user1).mint(underlyingAmount)

    await vault.connect(user0).stake(underlyingAmount)
    await vault.connect(user0).stake(underlyingAmount)
    await vault.connect(user1).stake(underlyingAmount)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount.mul(3))
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(0)
    expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(0)

    expect(await vault.balanceOf(await user0.getAddress())).to.be.equal(underlyingAmount.mul(2))
    expect(await vault.balanceOf(await user1.getAddress())).to.be.equal(underlyingAmount)

    await vault.connect(user0).claim()
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(underlyingAmount.mul(2))
    await vault.connect(user1).claim()
    expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(underlyingAmount)

    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })
})
