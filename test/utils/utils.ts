import { BigNumber } from "ethers"

export function approximately (expected: BigNumber, value: BigNumber, range = 10) {
    const lowerBound = expected.sub(expected.div(Math.floor(100 / range)))
    const higherBound = expected.add(expected.div(Math.floor(100 / range)))
  
    return value.gte(lowerBound) && value.lte(higherBound)
  }