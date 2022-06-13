import { ethers } from 'hardhat'
import { ConfigurationManager } from '../../typechain'
import { BigNumber, BigNumberish } from 'ethers'

interface ConfigurationManagerParameters {
  controller?: string
  feeRatio?: BigNumberish
}

export default async function createConfigurationManager (params: ConfigurationManagerParameters = {}): Promise<ConfigurationManager> {
  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configuration = await ConfigurationManager.deploy()

  if (params.controller == null) {
    const [deployer] = await ethers.getSigners()
    params.controller = deployer.address
  }

  if (params.feeRatio == null) {
    params.feeRatio = BigNumber.from('100')
  }

  await configuration.setParameter(ethers.utils.formatBytes32String('VAULT_CONTROLLER'), params.controller)
  await configuration.setParameter(ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), params.feeRatio)

  return configuration
}
