/* eslint-disable prefer-const */
import { UpdateSwapFeeRate } from '../types/Router/Router'
import { JswapFactory } from '../types/schema'
import { FACTORY_ADDRESS } from './helpers'

export function handleUpdateFee(event: UpdateSwapFeeRate): void {
  let factory = JswapFactory.load(FACTORY_ADDRESS)
  if (factory !== null) {
    factory.rate = event.params.currentFeeRate
    factory.syncBlockNumber = event.block.number
    factory.save()
  }
}
