import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('ConfigurationManager', () => {
  let configuration: Contract, capTargetAddress: string

  before(async () => {
    const [signer] = await ethers.getSigners()
    capTargetAddress = signer.address

    const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
    configuration = await ConfigurationManager.deploy()
  })

  it('writes parameters', async () => {
    const unknownParameterName = ethers.utils.formatBytes32String('UNKNOWN_PARAMETER')
    const parameterName = ethers.utils.formatBytes32String('CUSTOM_PARAMETER')
    const parameterValue = ethers.BigNumber.from(42)

    const tx = configuration.setParameter(ethers.constants.AddressZero, parameterName, parameterValue)
    await expect(tx)
      .to.emit(configuration, 'ParameterSet')
      .withArgs(ethers.constants.AddressZero, parameterName, parameterValue)

    expect(await configuration.getParameter(ethers.constants.AddressZero, parameterName)).to.be.equal(parameterValue)
    expect(await configuration.getGlobalParameter(parameterName)).to.be.equal(parameterValue)

    // Unknown parameters
    expect(await configuration.getParameter(ethers.constants.AddressZero, unknownParameterName)).to.be.equal(0)
    expect(await configuration.getGlobalParameter(unknownParameterName)).to.be.equal(0)
  })

  it('sets caps', async () => {
    const capAmount = ethers.BigNumber.from(42)

    expect(await configuration.getCap(capTargetAddress)).to.be.equal(0)

    const tx = configuration.setCap(capTargetAddress, capAmount)
    await expect(tx)
      .to.emit(configuration, 'SetCap')
      .withArgs(capTargetAddress, capAmount)

    expect(await configuration.getCap(capTargetAddress)).to.be.equal(capAmount)
  })

  it('cannot set a cap to address(0)', async () => {
    const capAmount = ethers.BigNumber.from(42)

    expect(await configuration.getCap(ethers.constants.AddressZero)).to.be.equal(0)

    const tx = configuration.setCap(ethers.constants.AddressZero, capAmount)
    await expect(tx)
      .to.be.revertedWithCustomError(configuration, 'ConfigurationManager__TargetCannotBeTheZeroAddress')

    expect(await configuration.getCap(ethers.constants.AddressZero)).to.be.equal(0)
  })

  it('should not assign a migrations with zero address as newVault', async () => {
    await expect(configuration.setVaultMigration(capTargetAddress, ethers.constants.AddressZero))
      .to.be.revertedWithCustomError(configuration, 'ConfigurationManager__NewVaultCannotBeTheZeroAddress')
  })
})
