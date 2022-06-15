import { BigNumber, BigNumberish } from 'ethers'

const DENOMINATOR = BigNumber.from('10000')

export default function feeExcluded (assets: BigNumberish, fee: BigNumber = BigNumber.from('100')): BigNumber {
  assets = BigNumber.from(assets)
  return assets.sub(assets.mul(fee).div(DENOMINATOR))
}
