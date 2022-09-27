/* eslint-disable prefer-const */
import { BigDecimal, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Bundle,
  Pair,
  PairDayData,
  PairHourData,
  Token,
  TokenDayData,
  TokenHourData,
  JswapDayData,
  JswapFactory,
  JswapFeesDayData,
  PairFeesHourData,
  PairFeesDayData
} from '../types/schema'
import { FACTORY_ADDRESS, ONE_BI, ZERO_BD, ZERO_BI } from './helpers'

export function updateJswapDayData(event: ethereum.Event): JswapDayData {
  let uniswap = JswapFactory.load(FACTORY_ADDRESS) as JswapFactory
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let uniswapDayData = JswapDayData.load(dayID.toString())
  if (uniswapDayData === null) {
    uniswapDayData = new JswapDayData(dayID.toString())
    uniswapDayData.date = dayStartTimestamp
    uniswapDayData.dailyVolumeUSD = ZERO_BD
    uniswapDayData.dailyVolumeETH = ZERO_BD
    uniswapDayData.totalVolumeUSD = ZERO_BD
    uniswapDayData.totalVolumeETH = ZERO_BD
    uniswapDayData.dailyVolumeUntracked = ZERO_BD
  }
  
  uniswapDayData.pairCount = uniswap.pairCount
  uniswapDayData.totalLiquidityUSD = uniswap.totalLiquidityUSD
  uniswapDayData.totalLiquidityETH = uniswap.totalLiquidityETH
  uniswapDayData.txCount = uniswap.txCount

  uniswapDayData.syncBlockNumber = event.block.number

  uniswapDayData.save()

  return uniswapDayData as JswapDayData
}

export function updatePairDayData(event: ethereum.Event): PairDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let dayPairID = event.address
    .toHexString()
    .concat('-')
    .concat(BigInt.fromI32(dayID).toString())
  let pair = Pair.load(event.address.toHexString()) as Pair
  let pairDayData = PairDayData.load(dayPairID)
  if (pairDayData === null) {
    pairDayData = new PairDayData(dayPairID)
    pairDayData.date = dayStartTimestamp
    pairDayData.token0 = pair.token0
    pairDayData.token1 = pair.token1
    pairDayData.pairAddress = event.address
    pairDayData.dailyVolumeToken0 = ZERO_BD
    pairDayData.dailyVolumeToken1 = ZERO_BD
    pairDayData.dailyVolumeUSD = ZERO_BD
    pairDayData.dailyTxns = ZERO_BI
  }

  pairDayData.totalSupply = pair.totalSupply
  pairDayData.reserve0 = pair.reserve0
  pairDayData.reserve1 = pair.reserve1
  pairDayData.reserveUSD = pair.reserveUSD
  pairDayData.dailyTxns = pairDayData.dailyTxns.plus(ONE_BI)

  pairDayData.syncBlockNumber = event.block.number

  pairDayData.save()

  return pairDayData as PairDayData
}

export function updatePairHourData(event: ethereum.Event): PairHourData {
  let timestamp = event.block.timestamp.toI32()
  let hourIndex = timestamp / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect
  let hourPairID = event.address
    .toHexString()
    .concat('-')
    .concat(BigInt.fromI32(hourIndex).toString())
  let pair = Pair.load(event.address.toHexString()) as Pair
  let pairHourData = PairHourData.load(hourPairID)
  if (pairHourData === null) {
    pairHourData = new PairHourData(hourPairID)
    pairHourData.hourStartUnix = hourStartUnix
    pairHourData.pair = event.address.toHexString()
    pairHourData.hourlyVolumeToken0 = ZERO_BD
    pairHourData.hourlyVolumeToken1 = ZERO_BD
    pairHourData.hourlyVolumeUSD = ZERO_BD
    pairHourData.hourlyTxns = ZERO_BI
  }

  pairHourData.totalSupply = pair.totalSupply
  pairHourData.reserve0 = pair.reserve0
  pairHourData.reserve1 = pair.reserve1
  pairHourData.reserveUSD = pair.reserveUSD
  pairHourData.hourlyTxns = pairHourData.hourlyTxns.plus(ONE_BI)

  pairHourData.syncBlockNumber = event.block.number

  pairHourData.save()

  return pairHourData as PairHourData
}

export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
  let bundle = Bundle.load('1')
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let tokenDayID = token.id
    .toString()
    .concat('-')
    .concat(BigInt.fromI32(dayID).toString())

  let tokenDayData = TokenDayData.load(tokenDayID)
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID)
    tokenDayData.date = dayStartTimestamp
    tokenDayData.token = token.id
    tokenDayData.priceUSD = token.derivedETH!.times(bundle!.ethPrice)
    tokenDayData.dailyVolumeToken = ZERO_BD
    tokenDayData.dailyVolumeETH = ZERO_BD
    tokenDayData.dailyVolumeUSD = ZERO_BD
    tokenDayData.dailyTxns = ZERO_BI
    tokenDayData.totalLiquidityUSD = ZERO_BD
  }
  tokenDayData.priceUSD = token.derivedETH!.times(bundle!.ethPrice)
  tokenDayData.totalLiquidityToken = token.totalLiquidity
  tokenDayData.totalLiquidityETH = token.totalLiquidity.times(token.derivedETH as BigDecimal)
  tokenDayData.totalLiquidityUSD = tokenDayData.totalLiquidityETH.times(bundle!.ethPrice)
  tokenDayData.dailyTxns = tokenDayData.dailyTxns.plus(ONE_BI)

  tokenDayData.syncBlockNumber = event.block.number

  tokenDayData.save()

  /**
   * @todo test if this speeds up sync
   */
  // updateStoredTokens(tokenDayData as TokenDayData, dayID)
  // updateStoredPairs(tokenDayData as TokenDayData, dayPairID)

  return tokenDayData as TokenDayData
}

export function updateTokenHourData(token: Token, event: ethereum.Event): TokenHourData {
  let bundle = Bundle.load('1') as Bundle

  let timestamp = event.block.timestamp.toI32()
  let hourIndex = timestamp / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect
  let tokenDayID = token.id
    .toString()
    .concat('-')
    .concat(BigInt.fromI32(hourIndex).toString())

  let tokenHourData = TokenHourData.load(tokenDayID)
  if (tokenHourData === null) {
    tokenHourData = new TokenHourData(tokenDayID)
    tokenHourData.hourStartUnix = hourStartUnix
    tokenHourData.token = token.id
    tokenHourData.priceUSD = token.derivedETH!.times(bundle.ethPrice)
    tokenHourData.hourlyVolumeToken = ZERO_BD
    tokenHourData.hourlyVolumeETH = ZERO_BD
    tokenHourData.hourlyVolumeUSD = ZERO_BD
    tokenHourData.hourlyTxns = ZERO_BI
    tokenHourData.totalLiquidityUSD = ZERO_BD
  }
  tokenHourData.priceUSD = token.derivedETH!.times(bundle.ethPrice)
  tokenHourData.totalLiquidityToken = token.totalLiquidity
  tokenHourData.totalLiquidityETH = token.totalLiquidity.times(token.derivedETH as BigDecimal)
  tokenHourData.totalLiquidityUSD = tokenHourData.totalLiquidityETH.times(bundle.ethPrice)
  tokenHourData.hourlyTxns = tokenHourData.hourlyTxns.plus(ONE_BI)

  tokenHourData.syncBlockNumber = event.block.number

  tokenHourData.save()

  return tokenHourData as TokenHourData
}

/** Update for PairFee */
export function updateJswapFeesDayData(event: ethereum.Event): JswapFeesDayData {
  let uniswap = JswapFactory.load(FACTORY_ADDRESS) as JswapFactory
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let uniswapDayData = JswapFeesDayData.load(dayID.toString())
  if (uniswapDayData === null) {
    uniswapDayData = new JswapFeesDayData(dayID.toString())
    uniswapDayData.date = dayStartTimestamp
    uniswapDayData.dailyFeesUntracked = ZERO_BD
    uniswapDayData.dailyFeesETH = ZERO_BD
    uniswapDayData.dailyFeesUSD = ZERO_BD
    uniswapDayData.totalFeesETH = ZERO_BD
    uniswapDayData.totalFeesUSD = ZERO_BD
    uniswapDayData.dailyAprRate = ZERO_BD
  }
  
  uniswapDayData.pairCount = uniswap.pairCount
  uniswapDayData.txCount = uniswap.txCount

  uniswapDayData.syncBlockNumber = event.block.number

  uniswapDayData.save()

  return uniswapDayData as JswapFeesDayData
}

export function updatePairFeesDayData(pairAddress: string, event: ethereum.Event): PairFeesDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let dayPairID = event.address
    .toHexString()
    .concat('-')
    .concat(BigInt.fromI32(dayID).toString())
  let pair = Pair.load(pairAddress) as Pair
  let pairDayData = PairFeesDayData.load(dayPairID)
  if (pairDayData === null) {
    pairDayData = new PairFeesDayData(dayPairID)
    pairDayData.date = dayStartTimestamp
    pairDayData.token0 = pair.token0
    pairDayData.token1 = pair.token1
    pairDayData.pairAddress = Address.fromString(pairAddress)
    pairDayData.dailyFeesToken0 = ZERO_BD
    pairDayData.dailyFeesToken1 = ZERO_BD
    pairDayData.dailyFeesToken0USD = ZERO_BD
    pairDayData.dailyFeesToken1USD = ZERO_BD
    pairDayData.dailyFeesUSD = ZERO_BD

    pairDayData.dailyAprRate = ZERO_BD

    pairDayData.dailyTxns = ZERO_BI
  }

  pairDayData.dailyTxns = pairDayData.dailyTxns.plus(ONE_BI)

  pairDayData.syncBlockNumber = event.block.number

  pairDayData.save()

  return pairDayData as PairFeesDayData
}

export function updatePairFeesHourData(pairAddress: string, event: ethereum.Event): PairFeesHourData {
  let timestamp = event.block.timestamp.toI32()
  let hourIndex = timestamp / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect
  let hourPairID = event.address
    .toHexString()
    .concat('-')
    .concat(BigInt.fromI32(hourIndex).toString())
  let pairHourData = PairFeesHourData.load(hourPairID)
  if (pairHourData === null) {
    pairHourData = new PairFeesHourData(hourPairID)
    pairHourData.hourStartUnix = hourStartUnix
    pairHourData.pair = pairAddress
    pairHourData.hourlyFeesToken0 = ZERO_BD
    pairHourData.hourlyFeesToken1 = ZERO_BD
    pairHourData.hourlyFeesToken0USD = ZERO_BD
    pairHourData.hourlyFeesToken1USD = ZERO_BD
    pairHourData.hourlyFeesUSD = ZERO_BD
    pairHourData.hourlyTxns = ZERO_BI
  }

  pairHourData.hourlyTxns = pairHourData.hourlyTxns.plus(ONE_BI)

  pairHourData.syncBlockNumber = event.block.number

  pairHourData.save()

  return pairHourData as PairFeesHourData
}