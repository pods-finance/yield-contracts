import { ethers } from 'hardhat'
import { ConfigurationManager } from '../../typechain'

interface ConfigurationManagerParameters {
  controller?: string
}

export default async function createConfigurationManager (params: ConfigurationManagerParameters = {}): Promise<ConfigurationManager> {
  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configuration = await ConfigurationManager.deploy()

  if (params.controller == null) {
    const [deployer] = await ethers.getSigners()
    params.controller = deployer.address
  }
  await configuration.setParameter(ethers.utils.formatBytes32String('VAULT_CONTROLLER'), params.controller)

  return configuration
}
