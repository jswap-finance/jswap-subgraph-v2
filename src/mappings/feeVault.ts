/* eslint-disable prefer-const */
import { log, BigInt, BigDecimal, store, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Pair,
  Token,
  JswapFeeVault,
  PairFee,
  Bundle,
  JswapFactory,
} from '../types/schema'
import { FeeVault as FeeVaultContract, AppendFee, UpdateDevFee } from '../types/FeeVault/FeeVault'
import { getEthPriceInUSD, findEthPerToken } from './pricing'
import {
  FACTORY_ADDRESS,
  FEE_VAULT_ADDRESS,
  convertTokenToDecimal,
  createOrGetTransaction,
  createOrGetToken,
  ONE_BI,
  ZERO_BD,
  ZERO_BI,
  DEFAULT_DEV_FEE_RATE,
} from './helpers'
import {
  updateJswapFeesDayData,
  updatePairFeesDayData,
  updatePairFeesHourData
} from './dayUpdates'

function createFeeVault(event: ethereum.Event): JswapFeeVault {
  // load FeeVault (create if first exchange)
  let feeVault = JswapFeeVault.load(FEE_VAULT_ADDRESS)
  if (feeVault === null) {
    feeVault = new JswapFeeVault(FEE_VAULT_ADDRESS)
    feeVault.base = BigInt.fromI32(10000)
    feeVault.valid = BigInt.fromI32(10000).minus(DEFAULT_DEV_FEE_RATE)
    feeVault.totalFeesUSD = ZERO_BD
    feeVault.totalFeesETH = ZERO_BD
    feeVault.updateFeeAtTimestamp = ZERO_BI
    feeVault.updateFeeAtBlockNumber = ZERO_BI
  }
  feeVault.syncBlockNumber = event.block.number
  feeVault.save()
  return feeVault as JswapFeeVault
}

function createPairFee(event: AppendFee, pair: Pair | null, feeTokenAmount: BigDecimal, feeTokenUSD: BigDecimal, isRewardAsToken0: boolean): void {
  if (pair === null) {
    return
  }
  if (event.params.pairToken.toHexString() != pair.id) {
    log.error('Mismatch pair {} ne {}', [
      event.params.pairToken.toHexString(),
      pair.id
    ])
    return
  }

  let transaction = createOrGetTransaction(event)
  let allFeesInTx = transaction.fees

  let fee = new PairFee(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(allFeesInTx.length).toString())
  )

  // update PairFee
  fee.transaction = transaction.id
  fee.timestamp = transaction.timestamp

  fee.pair = pair.id

  let rewardToken = createOrGetToken(event.params.rewordToken, event.block.number)
  fee.rewardToken = rewardToken.id

  fee.from = event.transaction.from
  fee.logIndex = event.logIndex

  fee.amount0Fee = isRewardAsToken0 ? feeTokenAmount : ZERO_BD
  fee.amount0FeeUSD = isRewardAsToken0 ? feeTokenUSD : ZERO_BD
  fee.amount1Fee = isRewardAsToken0 ? ZERO_BD : feeTokenAmount
  fee.amount1FeeUSD = isRewardAsToken0 ? ZERO_BD : feeTokenUSD
  fee.save()

  allFeesInTx.push(fee.id)
  transaction.fees = allFeesInTx
  transaction.save()
}

export function handlePairFee(event: AppendFee): void {
  let feeVault = createFeeVault(event)
  let pair = Pair.load(event.params.pairToken.toHexString())
  let token = Token.load(event.params.rewordToken.toHexString())

  if (pair === null) {
    log.warning('1. The pair entity is null', [])
  } else if (token === null) {
    log.warning('2. The token entity is null', [])
  } else {
    if (!(pair.token0 == token.id || pair.token1 == token.id)) {
      log.error('3. The pair {} ({}-{}) tokens are mismatch with token {}', [pair.id, pair.token0, pair.token1, token.id])
    }
  }
  
  if (pair === null || token === null) {
    log.error('Empty pair or empty token...', [])
    return
  } else if (!(pair.token0 == token.id || pair.token1 == token.id)) {
    log.error('Empty pair {} ({}-{}), or token {}, or mismatch token...', [pair.id, pair.token0, pair.token1, token.id])
    return
  }

  //TODO: calc the fee amount for user only (inputFeeAmount * )
  let isRewardAsToken0 = pair.token0 === token.id
  let feeAmount = event.params.amount
  let tokenAmount0 = convertTokenToDecimal(feeAmount, token.decimals)
  let tokenAmount = tokenAmount0.times(feeVault.valid.toBigDecimal()).div(feeVault.base.toBigDecimal())

  // update ETH price now that reserves could have changed
  let bundle = Bundle.load('1')
  bundle!.ethPrice = getEthPriceInUSD()
  bundle!.save()

  // update token ETH price
  token.derivedETH = findEthPerToken(token as Token)
  token.save()
  
  let feeTokenETH = tokenAmount.times(token.derivedETH as BigDecimal)
  let feeTokenUSD = feeTokenETH.times(bundle!.ethPrice)

  createPairFee(event, pair, tokenAmount, feeTokenUSD, isRewardAsToken0)

  // use tracked amounts globally
  feeVault.totalFeesETH = feeVault.totalFeesETH.plus(feeTokenETH)
  feeVault.totalFeesUSD = feeVault.totalFeesUSD.plus(feeTokenUSD)
  feeVault.syncBlockNumber = event.block.number

  token.txCount = token.txCount.plus(ONE_BI)
  pair.txCount = pair.txCount.plus(ONE_BI)
  
  // save entities
  token.save()
  pair.save()
  feeVault.save()

  // update hourly&daily entities
  let pairFeesDayData = updatePairFeesDayData(pair.id, event)
  let pairFeesHourData = updatePairFeesHourData(pair.id, event)
  let jswapFeesDayData = updateJswapFeesDayData(event)

  let feeAmountToken0 = isRewardAsToken0 ? tokenAmount : ZERO_BD
  let feeAmountToken1 = isRewardAsToken0 ? ZERO_BD : tokenAmount
  let feeUSDToken0 = isRewardAsToken0 ? feeTokenUSD : ZERO_BD
  let feeUSDToken1 = isRewardAsToken0 ? ZERO_BD : feeTokenUSD

  // update daily data
  pairFeesDayData.dailyFeesToken0 = pairFeesDayData.dailyFeesToken0.plus(feeAmountToken0)
  pairFeesDayData.dailyFeesToken1 = pairFeesDayData.dailyFeesToken1.plus(feeAmountToken1)
  pairFeesDayData.dailyFeesToken0USD = pairFeesDayData.dailyFeesToken0USD.plus(feeUSDToken0)
  pairFeesDayData.dailyFeesToken1USD = pairFeesDayData.dailyFeesToken1USD.plus(feeUSDToken1)
  pairFeesDayData.dailyFeesUSD = pairFeesDayData.dailyFeesUSD.plus(feeUSDToken0).plus(feeUSDToken1)
  if (pair.reserveUSD.gt(ZERO_BD)) {
    pairFeesDayData.dailyAprRate = pairFeesDayData.dailyFeesUSD.div(pair.reserveUSD)
  }
  pairFeesDayData.save()

  pairFeesHourData.hourlyFeesToken0 = pairFeesHourData.hourlyFeesToken0.plus(feeAmountToken0)
  pairFeesHourData.hourlyFeesToken1 = pairFeesHourData.hourlyFeesToken1.plus(feeAmountToken1)
  pairFeesHourData.hourlyFeesToken0USD = pairFeesHourData.hourlyFeesToken0USD.plus(feeUSDToken0)
  pairFeesHourData.hourlyFeesToken1USD = pairFeesHourData.hourlyFeesToken1USD.plus(feeUSDToken1)
  pairFeesHourData.hourlyFeesUSD = pairFeesHourData.hourlyFeesUSD.plus(feeUSDToken0).plus(feeUSDToken1)
  pairFeesHourData.save()

  let jswap = JswapFactory.load(FACTORY_ADDRESS)
  jswapFeesDayData.dailyFeesETH = jswapFeesDayData.dailyFeesETH.plus(feeTokenETH)
  jswapFeesDayData.dailyFeesUSD = jswapFeesDayData.dailyFeesUSD.plus(feeTokenUSD)
  jswapFeesDayData.totalFeesETH = jswapFeesDayData.totalFeesETH.plus(feeTokenETH)
  jswapFeesDayData.totalFeesUSD = jswapFeesDayData.totalFeesUSD.plus(feeTokenUSD)
  if (jswap!.totalLiquidityUSD.gt(ZERO_BD)) {
    jswapFeesDayData.dailyAprRate = jswapFeesDayData.dailyFeesUSD.div(jswap!.totalLiquidityUSD)
  }
  jswapFeesDayData.save()
}

export function handleUpdateDevFee(event: UpdateDevFee): void {
  let feeVault = createFeeVault(event)
  let devFee = event.params.devFee
  feeVault.valid = BigInt.fromI32(10000).minus(devFee)
  feeVault.updateFeeAtTimestamp = event.block.timestamp
  feeVault.updateFeeAtBlockNumber = event.block.number
  feeVault.save()
}