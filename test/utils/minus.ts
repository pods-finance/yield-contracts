import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

export default function minus (value: BigNumber | string): BigNumber {
  return ethers.utils.parseUnits('0').sub(BigNumber.from(value))
}
