import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('AuxMath', () => {
  let math: Contract

  before(async () => {
    const AuxMathMock = await ethers.getContractFactory('AuxMathMock')
    math = await AuxMathMock.deploy()
  })

  describe('mulDivDown', () => {
    it('should not divide by 0', async () => {
      await expect(math.mulDivDown(10, 10, 0)).to.be.revertedWith('AuxMath__DivByZero()')
    })

    it('should round down', async () => {
      expect(await math.mulDivDown(0, 10, 10)).to.be.equal(0)
      expect(await math.mulDivDown(10, 0, 10)).to.be.equal(0)
      expect(await math.mulDivDown(100, 20, 3)).to.be.equal(666)
      expect(await math.mulDivDownFractional0({ numerator: 100, denominator: 3 }, 20)).to.be.equal(666)
      expect(await math.mulDivDownFractional1(100, { numerator: 20, denominator: 3 })).to.be.equal(666)
      expect(await math.fractionRoundDown({ numerator: 1000, denominator: 3 })).to.be.equal(333)
    })
  })

  describe('mulDivUp', () => {
    it('should not divide by 0', async () => {
      await expect(math.mulDivUp(10, 10, 0)).to.be.revertedWith('AuxMath__DivByZero()')
    })

    it('should round up', async () => {
      expect(await math.mulDivUp(0, 10, 10)).to.be.equal(0)
      expect(await math.mulDivUp(10, 0, 10)).to.be.equal(0)
      expect(await math.mulDivUp(100, 20, 3)).to.be.equal(667)
      expect(await math.mulDivUpFractional0({ numerator: 100, denominator: 3 }, 20)).to.be.equal(667)
      expect(await math.mulDivUpFractional1(100, { numerator: 20, denominator: 3 })).to.be.equal(667)
      expect(await math.fractionRoundUp({ numerator: 1000, denominator: 3 })).to.be.equal(334)
    })
  })

  describe('min', () => {
    it('should return the smaller value', async () => {
      expect(await math.min(100, 10)).to.be.equal(10)
      expect(await math.min(10, 100)).to.be.equal(10)
      expect(await math.min(10, 10)).to.be.equal(10)
    })
  })
})
