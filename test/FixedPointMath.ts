import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('FixedPointMath', () => {
  let math: Contract

  before(async () => {
    const FixedPointMathMock = await ethers.getContractFactory('FixedPointMathMock')
    math = await FixedPointMathMock.deploy()
  })

  describe('mulDivDown', () => {
    it('should not divide by 0', async () => {
      await expect(math.mulDivDown(10, 10, 0)).to.be.revertedWith('FixedPointMath__DivByZero()')
    })

    it('should round down', async () => {
      expect(await math.mulDivDown(0, 10, 10)).to.be.equal(0)
      expect(await math.mulDivDown(10, 0, 10)).to.be.equal(0)
      expect(await math.mulDivDown(100, 20, 3)).to.be.equal(666)
    })
  })

  describe('mulDivUp', () => {
    it('should not divide by 0', async () => {
      await expect(math.mulDivUp(10, 10, 0)).to.be.revertedWith('FixedPointMath__DivByZero()')
    })

    it('should round up', async () => {
      expect(await math.mulDivUp(0, 10, 10)).to.be.equal(0)
      expect(await math.mulDivUp(10, 0, 10)).to.be.equal(0)
      expect(await math.mulDivUp(100, 20, 3)).to.be.equal(667)
    })
  })
})
