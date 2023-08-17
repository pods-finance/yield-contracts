import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import minus from '../utils/minus'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import { ISTETH, IwstETH, RebasingWrapper } from '../../typechain'

describe('RebasingWrapper', () => {
  let rebasingToken: RebasingWrapper, exchangeRateToken: IwstETH, stEthContract: ISTETH

  let user0: SignerWithAddress, user1: SignerWithAddress

  let snapshotId: BigNumber

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

  before(async () => {
    await startMainnetFork()

    ;[user1] = await ethers.getSigners()

    const wstEthWhale = '0x59cEE32F3FFAeABC0d4991ac7569ebaD09E1a7d4'
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wstEthWhale]
    })
    user0 = await ethers.getSigner(wstEthWhale)

    const wstETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'
    const stETH = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'
    exchangeRateToken = await ethers.getContractAt('IwstETH', wstETH)
    stEthContract = await ethers.getContractAt('ISTETH', stETH)

    const RebasingWrapper = await ethers.getContractFactory('RebasingWrapper')
    rebasingToken = await RebasingWrapper.deploy(wstETH)
    await exchangeRateToken.connect(user0).transfer(rebasingToken.address, ethers.utils.parseEther('0.1'))
    await rebasingToken.connect(user0).initialize()
    await exchangeRateToken.connect(user0).approve(rebasingToken.address, ethers.constants.MaxUint256)
    await stEthContract.connect(user0).approve(exchangeRateToken.address, ethers.constants.MaxUint256)
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

  describe('sanity checks', () => {
    it('cant reinitialize', async () => {
      await expect(rebasingToken.connect(user0).initialize()).to.be.revertedWith('already initialized')
    })

    it('check read only consistency', async () => {
      /**
       * basic test. Our "rebasingToken" is a wrapper of wstETH, so we can deposit wstETH to it, and the
       * rebasingToken will mint the same amount of raw stETH that you'd get from unwrapping the wstETH.
       */
      const wstETHAmount = ethers.utils.parseEther('1')
      const wrapAmount = await exchangeRateToken.getStETHByWstETH(wstETHAmount)
      const rewrappedAmount = await rebasingToken.convertToRebasing(wstETHAmount)

      expect(wrapAmount).to.be.equal(rewrappedAmount)

      const stEthAmount = ethers.utils.parseEther('1')
      const wrappedAmount = await exchangeRateToken.getWstETHByStETH(stEthAmount)
      const unrewrappedAmount = await rebasingToken.convertToExchangeRate(stEthAmount)

      expect(wrappedAmount).to.be.equal(unrewrappedAmount)
    })
    it('check wrap/unwrap consistency', async () => {
      /**
       * we know that wstETH unwrapped should give us stEtH.
       * we also know that wrapping wstETH should mimic the behavior of stETH
       * so depositing wstETH to the rebasingToken should give us the same amount of stETH as unwrapping wstETH
       */
      const oneWstEth = ethers.utils.parseEther('1')
      const unwrapedAmount = await exchangeRateToken.connect(user0).callStatic.unwrap(oneWstEth)
      await rebasingToken.connect(user0).depositFor(user0.address, oneWstEth)
      const rewrappedAmount = await rebasingToken.balanceOf(user0.address)

      expect(unwrapedAmount).to.be.equal(rewrappedAmount)
      /**
       * we know that wrapping stETH will give us wstETH.
       * we also know that withdrawing our rebasing token will give us wstETH
       * so withdrawing wstETH from the rebasingToken should give us the same amount of wstETH as wrapping stETH
       */
      await (await exchangeRateToken.connect(user0).unwrap(oneWstEth)).wait()
      const stETHAmount = ethers.utils.parseEther('0.5')
      const wstEthAmount = await exchangeRateToken.connect(user0).callStatic.wrap(stETHAmount)
      const withdrawTrxn = await (await rebasingToken.connect(user0).withdrawTo(user0.address, stETHAmount)).wait()
      console.log('withdrawTrxn', withdrawTrxn.events)
      const withdrawEvent = withdrawTrxn.events?.find((e) => e.event === 'SharesBurnt')
      const sharesAmount = withdrawEvent?.args?.sharesAmount

      /**
       * there will be some rounding errors, so we'll just check that they're close enough
       * we'll test if the rounding error is in the right direction in the next test
       */
      expect(wstEthAmount).to.be.closeTo(sharesAmount, 1)
    })

    it('check deposit/withdraw consistency: deposit first then withdraw - even', async () => {
      const oneWstEth = ethers.utils.parseEther('1')
      const initialWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      await rebasingToken.connect(user0).depositFor(user0.address, oneWstEth)
      const rebasingTokenAmount = await rebasingToken.balanceOf(user0.address)
      await rebasingToken.connect(user0).withdrawTo(user0.address, rebasingTokenAmount)
      const finalWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      // greated then or equal garantees that zapping in and out would benefit the wrapper
      // not the user. This way it's impossible to leave the wrapper insolvent
      expect(initialWstethBalance).to.be.greaterThanOrEqual(finalWstethBalance)
    })
    it('check deposit/withdraw consistency: deposit first then withdraw - odd', async () => {
      const oneWstEth = ethers.utils.parseEther('1').add(1)
      const initialWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      await rebasingToken.connect(user0).depositFor(user0.address, oneWstEth)
      const rebasingTokenAmount = await rebasingToken.balanceOf(user0.address)
      await rebasingToken.connect(user0).withdrawTo(user0.address, rebasingTokenAmount)
      const finalWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      // greated then or equal garantees that zapping in and out would benefit the wrapper
      // not the user. This way it's impossible to leave the wrapper insolvent
      expect(initialWstethBalance).to.be.greaterThanOrEqual(finalWstethBalance)
      expect(initialWstethBalance).to.be.closeTo(finalWstethBalance, 1)
    })
    it('check deposit/withdraw consistency: withdraw first then deposit', async () => {
      // setup
      const tenWstEth = ethers.utils.parseEther('10')
      await rebasingToken.connect(user0).depositFor(user0.address, tenWstEth)

      // test
      const oneWstEth = ethers.utils.parseEther('1')
      const initialWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      const shares = await rebasingToken.convertToRebasing(oneWstEth)
      await rebasingToken.connect(user0).withdrawTo(user0.address, shares)
      await rebasingToken.connect(user0).depositFor(user0.address, oneWstEth)
      const finalWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      // greated then or equal garantees that zapping in and out would benefit the wrapper
      // not the user. This way it's impossible to leave the wrapper insolvent
      expect(initialWstethBalance).to.be.greaterThanOrEqual(finalWstethBalance)
      expect(initialWstethBalance).to.be.closeTo(finalWstethBalance, 1)
    })

    const fakeRebasingLido = async (numerator: number, denominator: number): Promise<void> => {
      // Force reduction of Lidos balance to simulate a slashing event
      // SLOT_STETH_BALANCE is equal to keccak256("lido.Lido.beaconBalance")
      const SLOT_STETH_BALANCE = '0xa66d35f054e68143c18f32c990ed5cb972bb68a68f500cd2dd3a16bbf3686483'

      const balanceSTETHBefore = await stEthContract.getTotalPooledEther()
      const newBalance = balanceSTETHBefore.mul(numerator).div(denominator)
      const newBalancePad32 = ethers.utils.hexZeroPad(ethers.utils.hexValue(newBalance), 32)

      await ethers.provider.send('hardhat_setStorageAt', [
        stEthContract.address,
        SLOT_STETH_BALANCE,
        newBalancePad32
      ])
    }

    it('test other cases of to/from', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      await exchangeRateToken.connect(user0).unwrap(hundredWstEth)
      await rebasingToken.connect(user0).depositFor(user1.address, hundredWstEth)
      const user1assetsOf = await rebasingToken.sharesOf(user1.address)
      expect(user1assetsOf).to.be.closeTo(hundredWstEth, 1)
      const user1balanceOf = await rebasingToken.balanceOf(user1.address)
      expect(user1balanceOf).to.be.closeTo(await rebasingToken.convertToRebasing(hundredWstEth), 1)

      const user0wstEthBalanceBefore = await exchangeRateToken.balanceOf(user0.address)
      await expect(async () => await rebasingToken.connect(user1).withdrawTo(user0.address, user1balanceOf))
        .to.changeTokenBalances(
          rebasingToken,
          [user1],
          [minus(user1balanceOf.sub(1))]
        )
      const user0wstEthBalanceAfter = await exchangeRateToken.balanceOf(user0.address)
      expect(user0wstEthBalanceAfter.sub(user0wstEthBalanceBefore)).to.be.closeTo(hundredWstEth, 1)
    })

    it('test allowance corner cases', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      const fifty = ethers.utils.parseEther('50')
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      await rebasingToken.connect(user0).approve(user1.address, fifty)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, fifty.add(1))).to.be.revertedWith('ALLOWANCE_EXCEEDED')
      await rebasingToken.connect(user0).increaseAllowance(user1.address, fifty)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, fifty.add(fifty))).to.not.be.reverted
    })

    it('test allowance shall pass', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      const fifty = ethers.utils.parseEther('50')
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      await rebasingToken.connect(user0).approve(user1.address, fifty)
      await fakeRebasingLido(110, 100)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, fifty)).to.not.be.reverted
      expect(await rebasingToken.allowance(user0.address, user1.address)).to.be.equal(0)
    })

    it('test increase allowance corner cases', async () => {
      const hundred = ethers.utils.parseEther('100')
      const fifty = ethers.utils.parseEther('50')
      await rebasingToken.connect(user0).depositFor(user0.address, hundred)
      await rebasingToken.connect(user0).approve(user1.address, fifty)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, hundred)).to.be.reverted
      await rebasingToken.connect(user0).increaseAllowance(user1.address, fifty)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, hundred.add(1))).to.be.reverted
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, hundred)).to.not.be.reverted
      expect(await rebasingToken.allowance(user0.address, user1.address)).to.be.equal(0)
    })

    it('test decrease allowance corner cases', async () => {
      const hundred = ethers.utils.parseEther('100')
      const fifty = ethers.utils.parseEther('50')
      const thirty = ethers.utils.parseEther('30')
      const twenty = ethers.utils.parseEther('20')
      await rebasingToken.connect(user0).depositFor(user0.address, hundred)
      await rebasingToken.connect(user0).approve(user1.address, fifty)
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, hundred)).to.be.reverted
      await expect(rebasingToken.connect(user0).decreaseAllowance(user1.address, hundred)).to.be.revertedWith('ALLOWANCE_BELOW_ZERO')
      await rebasingToken.connect(user0).decreaseAllowance(user1.address, thirty)

      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, twenty.add(1))).to.be.reverted
      await expect(rebasingToken.connect(user1).transferFrom(user0.address, user1.address, twenty)).to.not.be.reverted
      expect(await rebasingToken.allowance(user0.address, user1.address)).to.be.equal(0)
    })

    it('test total shares', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      const totalShares = await rebasingToken.getTotalShares()
      const addressBalanceOf = await exchangeRateToken.balanceOf(rebasingToken.address)
      expect(totalShares).to.be.equal(addressBalanceOf)
    })

    it('tests transferShares and transferSharesFrom', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      const ten = ethers.utils.parseEther('10')
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      const sharesOfBefore = await rebasingToken.sharesOf(user0.address)
      await rebasingToken.connect(user0).transferShares(user1.address, ten)
      const sharesOfAfter = await rebasingToken.sharesOf(user0.address)
      expect(sharesOfBefore.sub(sharesOfAfter)).to.be.equal(ten)

      const tenRebasig = await rebasingToken.convertToRebasing(ten)
      await rebasingToken.connect(user0).approve(user1.address, tenRebasig)
      await expect(rebasingToken.connect(user1).transferSharesFrom(user0.address, user1.address, ten.add(1))).to.be.reverted
      await rebasingToken.connect(user1).transferSharesFrom(user0.address, user1.address, ten)
    })

    it('tests revert statements', async () => {
      const ten = ethers.utils.parseEther('10')
      await expect(
        rebasingToken.connect(user1).transferSharesFrom(ZERO_ADDRESS, user1.address, BigNumber.from(0))
      ).to.be.revertedWith('APPROVE_FROM_ZERO_ADDR')

      await expect(
        rebasingToken.connect(user0).approve(ZERO_ADDRESS, ten)
      ).to.be.revertedWith('APPROVE_TO_ZERO_ADDR')

      await expect(
        rebasingToken.connect(user0).transferShares(ZERO_ADDRESS, ten)
      ).to.be.revertedWith('TRANSFER_TO_ZERO_ADDR')

      await expect(
        rebasingToken.connect(user0).transferShares(user1.address, ten)
      ).to.be.revertedWith('BALANCE_EXCEEDED')

      await expect(
        rebasingToken.connect(user0).withdrawTo(user1.address, ten)
      ).to.be.revertedWith('BALANCE_EXCEEDED')

      await expect(
        rebasingToken.connect(user0).depositFor(ZERO_ADDRESS, ten)
      ).to.be.revertedWith('MINT_TO_ZERO_ADDR')

      await expect(
        rebasingToken.connect(user0).transferShares(rebasingToken.address, ten)
      ).to.be.revertedWith('TRANSFER_TO_CONTRACT')

      const wstETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'

      const rebasingWrapperMockFactory = await ethers.getContractFactory('RebasingWrapperMock')
      const rebasingTokenMock = await rebasingWrapperMockFactory.deploy(wstETH)

      await expect(
        rebasingTokenMock.connect(user0).transferSharesMock(ZERO_ADDRESS, user0.address, ten)
      ).to.be.revertedWith('TRANSFER_FROM_ZERO_ADDR')

      await expect(
        rebasingTokenMock.connect(user0).burnSharesMock(ZERO_ADDRESS, ten)
      ).to.be.revertedWith('BURN_FROM_ZERO_ADDR')
    })

    it('should be equal to totalPooledAssets', async () => {
      const hundredWstEth = ethers.utils.parseEther('100')
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      const totalPooledAssets = await rebasingToken.getTotalPooledAssets()
      const totalShares = await rebasingToken.getTotalShares()
      const addressBalanceOf = await exchangeRateToken.balanceOf(rebasingToken.address)
      const convertedBalanceOf = await exchangeRateToken.getStETHByWstETH(addressBalanceOf)
      expect(totalPooledAssets).to.be.equal(convertedBalanceOf)
      expect(totalShares).to.be.equal(addressBalanceOf)
    })

    it('cant deposit more than you have', async () => {
      const hundredWstEth = ethers.utils.parseEther('10000')
      await expect(rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('basic ERC20 funcionality', async () => {
      /**
       * Setup: just declaring a handy variables and unwrapping some wstETH
       * to stETH so user0 has some stETH to be used as base for comparison.
       * user0 deposits 100 wstETH to the rebasingToken and sends 50 wwstETH to user1.
       */
      const hundredWstEth = ethers.utils.parseEther('100')
      const fifty = ethers.utils.parseEther('50')
      const user0stETHBalanceBefore = await stEthContract.balanceOf(user0.address)
      const totalSupplyBefore = await rebasingToken.totalSupply()
      await exchangeRateToken.connect(user0).unwrap(hundredWstEth)
      const user0stETHBalanceAfter = await stEthContract.balanceOf(user0.address)
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)
      const totalSupplyAfter = await rebasingToken.totalSupply()
      const totalSupplyDiff = totalSupplyAfter.sub(totalSupplyBefore)
      const expectedTotalSupplyDiff = user0stETHBalanceAfter.sub(user0stETHBalanceBefore)
      expect(totalSupplyDiff).to.be.closeTo(expectedTotalSupplyDiff, 2)

      /**
       * Test: just a sanity check to see if the balance of user0 is correct.
       * assetsOf should return the inputed amount of wstETH.
       * Also using the opportunity to check if the totalSupply is the same.
       */
      const expectedUser0Balance = await rebasingToken.convertToRebasing(hundredWstEth)
      expect(await rebasingToken.balanceOf(user0.address)).to.be.equal(expectedUser0Balance)
      expect(await rebasingToken.sharesOf(user0.address)).to.be.equal(hundredWstEth)

      /**
       * Test: just a sanity check to see if the balance of user1 is correct.
       * transfer and balanceOf both work with "shares". So both should be close
       * to fifty.
       */
      await expect(async () => await rebasingToken.connect(user0).transfer(user1.address, fifty))
        .to.changeTokenBalances(
          rebasingToken,
          [user0, user1],
          [minus(fifty.sub(1)), fifty.sub(1)]
        )
    })

    it('basic rebasing event', async () => {
      /**
       * Setup: just declaring some handy variables and unwrapping some wstETH
       * to stETH so user0 has some stETH to be used as base for comparison.
       * user0 deposits 50 wstETH to the rebasingToken
       */
      const hundredWstEth = ethers.utils.parseEther('100')
      await exchangeRateToken.connect(user0).unwrap(hundredWstEth)
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)

      /**
       * Test: We can compare the balance before and after the rebasing event. We then trigger a fake rebasing
       * event by increasing the Lido balance, and then we compare the balance of stETH
       * to the balance of wwStETH. We expect the balance of wwStETH to increase in the same
       * proportion as the balance of stETH.
       */
      const initialAssets = await rebasingToken.connect(user0).convertToExchangeRate(await rebasingToken.balanceOf(user0.address))
      await fakeRebasingLido(101, 100)
      const finalAssets = await rebasingToken.connect(user0).convertToExchangeRate(await rebasingToken.balanceOf(user0.address))
      expect(initialAssets).to.be.greaterThanOrEqual(finalAssets)
      expect(initialAssets).to.be.closeTo(finalAssets, 1)
    })

    it('slashing event', async () => {
      /**
       * Setup: just declaring some handy variables and unwrapping some wstETH
       * to stETH so user0 has some stETH to be used as base for comparison
       */
      const hundredWstEth = ethers.utils.parseEther('100')
      await exchangeRateToken.connect(user0).unwrap(hundredWstEth)
      await rebasingToken.connect(user0).depositFor(user0.address, hundredWstEth)

      /**
       * Test: user0 deposits 50 wstETH to the rebasingToken, so we can compare the
       * balance before and after the rebasing event. We then trigger a fake slashing
       * event by decrEasing Lido's balance, and then we compare the balance of stETH
       * to the balance of wwStETH. We expect the balance of wwStETH to decrease in the same
       * proportion as the balance of stETH.
       */
      const initialAssets = await rebasingToken.connect(user0).convertToExchangeRate(await rebasingToken.balanceOf(user0.address))
      await fakeRebasingLido(99, 100)
      const finalAssets = await rebasingToken.connect(user0).convertToExchangeRate(await rebasingToken.balanceOf(user0.address))
      expect(initialAssets).to.be.greaterThanOrEqual(finalAssets)
      expect(initialAssets).to.be.closeTo(finalAssets, 1)

      const previousWstethBalance = await exchangeRateToken.balanceOf(user0.address)
      await rebasingToken.connect(user0).withdrawTo(user0.address, await rebasingToken.balanceOf(user0.address))
      const finalWstethBalance = (await exchangeRateToken.balanceOf(user0.address)).sub(previousWstethBalance)

      expect(hundredWstEth).to.be.greaterThanOrEqual(finalWstethBalance)
      expect(hundredWstEth).to.be.closeTo(finalWstethBalance, 1)
    })
  })
})
