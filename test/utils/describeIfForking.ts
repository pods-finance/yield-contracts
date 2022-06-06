import hre from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/src/types/config'
import { describe } from 'mocha'

export default function describeIfForking (): Mocha.ExclusiveSuiteFunction | Mocha.PendingSuiteFunction {
  const localNetwork = (hre.network.config as HardhatNetworkConfig)
  const isForking = localNetwork?.forking?.enabled ?? false

  if (isForking) {
    return describe.only
  } else {
    return describe.skip
  }
}
