import hre from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/src/types/config'
import { describe } from 'mocha'

export default function describeIfForking (title: string, suite: () => void): Mocha.Suite {
  const localNetwork = (hre.network.config as HardhatNetworkConfig)
  const isForking = localNetwork?.forking?.enabled ?? false

  if (isForking) {
    return describe.only(title, suite)
  } else {
    return describe.skip(title, suite) as Mocha.Suite
  }
}
