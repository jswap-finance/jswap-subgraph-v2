/* eslint-disable prefer-const */
import { log, BigInt, BigDecimal, Address, ethereum } from '@graphprotocol/graph-ts'
import { ERC20 } from '../types/Factory/ERC20'
import { ERC20SymbolBytes } from '../types/Factory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../types/Factory/ERC20NameBytes'
import { PairDividend } from '../types/templates/PairDividend/PairDividend'
import {
  User,
  Bundle,
  Token,
  LiquidityPosition,
  LiquidityPositionSnapshot,
  Pair,
  Transaction,
  PairFeesTrack,
  UserFee,
  UserPairFee,
} from '../types/schema'
import { Factory as FactoryContract } from '../types/Factory/Factory'
import { TokenDefinition } from './tokenDefinition'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0x2a24c4b12f62b14e35fdffe9baf9c2e16ba11d08' // lowercase
export const FEE_VAULT_ADDRESS = '0x006659cfd0c058e8879f256a82acd01d2c787aa3' // lowercase

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let DEFAULT_SWAP_FEE_RATE = BigInt.fromI32(100)
export let DEFAULT_DEV_FEE_RATE = BigInt.fromI32(4000)

export let factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS))

export let STABLE_COINS: string[] = [
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  '0x55d398326f99059ff775485246999027b3197955', // USDT
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', // DAI
]

// token where amounts should contribute to tracked volume and liquidity
export let WHITELIST_TOKENS: string[] = [
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WETH
  '0x5fac926bf1e638944bb16fb5b787b5ba4bc85b0a', // JF
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  '0x55d398326f99059ff775485246999027b3197955', // USDT
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', // DAI
  '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // ETH
  '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', // BTCB
]

// rebass tokens, dont count in tracked volume
export let UNTRACKED_PAIRS: string[] = []

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.equals(ZERO_BD)) {
    return ZERO_BD
  } else {
    return amount0.div(amount1)
  }
}

export function bigDecimalExponated(value: BigDecimal, power: BigInt): BigDecimal {
  if (power.equals(ZERO_BI)) {
    return ONE_BD
  }
  let negativePower = power.lt(ZERO_BI)
  let result = ZERO_BD.plus(value)
  let powerAbs = power.abs()
  for (let i = ONE_BI; i.lt(powerAbs); i = i.plus(ONE_BI)) {
    result = result.times(value)
  }

  if (negativePower) {
    result = safeDiv(ONE_BD, result)
  }

  return result
}

export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString('1000000000000000000')
}

export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(exponentToBigDecimal(BI_18))
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function priceToDecimal(amount: BigDecimal, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return amount
  }
  return safeDiv(amount, exponentToBigDecimal(exchangeDecimals))
}

export function equalToZero(value: BigDecimal): boolean {
  const formattedVal = parseFloat(value.toString())
  const zero = parseFloat(ZERO_BD.toString())
  if (zero == formattedVal) {
    return true
  }
  return false
}

export function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  // static definitions overrides
  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if(staticDefinition != null) {
    return (staticDefinition as TokenDefinition).symbol
  }

  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let symbolValue = 'unknown'
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      // for broken pairs that have no symbol function exposed
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

export function fetchTokenName(tokenAddress: Address): string {
  // static definitions overrides
  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if(staticDefinition != null) {
    return (staticDefinition as TokenDefinition).name
  }

  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let nameValue = 'unknown'
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      // for broken exchanges that have no name function exposed
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {

  let contract = ERC20.bind(tokenAddress)
  let totalSupplyValue: BigInt = BigInt.zero() // Basic types cannot be nullable
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    totalSupplyValue = totalSupplyResult.value
  }
  return totalSupplyValue
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  // static definitions overrides
  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if(staticDefinition != null) {
    return (staticDefinition as TokenDefinition).decimals
  }

  let contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  let decimalValue: i32 = 0 // Basic types cannot be nullable
  let decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    decimalValue = decimalResult.value
  }
  return BigInt.fromI32(decimalValue as i32)
}

export function createLiquidityPosition(exchange: Address, user: Address): LiquidityPosition {
  let id = exchange
    .toHexString()
    .concat('-')
    .concat(user.toHexString())
  let liquidityTokenBalance = LiquidityPosition.load(id)
  if (liquidityTokenBalance === null) {
    let pair = Pair.load(exchange.toHexString()) as Pair
    pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI)
    liquidityTokenBalance = new LiquidityPosition(id)
    liquidityTokenBalance.liquidityTokenBalance = ZERO_BD
    liquidityTokenBalance.pair = exchange.toHexString()
    liquidityTokenBalance.user = user.toHexString()
    liquidityTokenBalance.save()
    pair.save()
  }
  if (liquidityTokenBalance === null) log.error('LiquidityTokenBalance is null', [id])
  return liquidityTokenBalance as LiquidityPosition
}

export function createUser(address: Address): void {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.usdSwapped = ZERO_BD
    user.save()
  }
}

export function createLiquiditySnapshot(position: LiquidityPosition, event: ethereum.Event): void {
  let timestamp = event.block.timestamp.toI32()
  let bundle = Bundle.load('1')
  let pair = Pair.load(position.pair) as Pair
  let token0 = Token.load(pair.token0) as Token
  let token1 = Token.load(pair.token1) as Token

  // create new snapshot
  let snapshot = new LiquidityPositionSnapshot(position.id.concat(timestamp.toString()))
  snapshot.liquidityPosition = position.id
  snapshot.timestamp = timestamp
  snapshot.block = event.block.number.toI32()
  snapshot.user = position.user
  snapshot.pair = position.pair
  snapshot.token0PriceUSD = token0.derivedETH!.times(bundle!.ethPrice)
  snapshot.token1PriceUSD = token1.derivedETH!.times(bundle!.ethPrice)
  snapshot.reserve0 = pair.reserve0
  snapshot.reserve1 = pair.reserve1
  snapshot.reserveUSD = pair.reserveUSD
  snapshot.liquidityTokenTotalSupply = pair.totalSupply
  snapshot.liquidityTokenBalance = position.liquidityTokenBalance
  snapshot.liquidityPosition = position.id
  snapshot.save()
  position.save()
}

export function createOrGetTransaction(event: ethereum.Event): Transaction {
  let txHash = event.transaction.hash.toHexString()
  let transaction = Transaction.load(txHash)
  if (transaction === null) {
    transaction = new Transaction(txHash)
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.swaps = []
    transaction.burns = []
    transaction.fees = []
    transaction.claims = []

    transaction.save()
  }
  return transaction as Transaction
}

export function createOrGetToken(tokenAddress: Address, blockNumber: BigInt): Token {
  let token = Token.load(tokenAddress.toHexString())

  // fetch info if null
  if (token === null) {
    token = new Token(tokenAddress.toHexString())
    token.symbol = fetchTokenSymbol(tokenAddress)
    token.name = fetchTokenName(tokenAddress)
    token.totalSupply = fetchTokenTotalSupply(tokenAddress)    
    token.decimals = fetchTokenDecimals(tokenAddress)

    token.syncBlockNumber = blockNumber
  
    token.derivedETH = ZERO_BD
    token.tradeVolume = ZERO_BD
    token.tradeVolumeUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.totalLiquidity = ZERO_BD
    token.txCount = ZERO_BI

    token.save()
  }
  return token as Token
}

export function fetchPairFeeRewardToken(pairTrackAddress: Address): Address {
  let contract = PairDividend.bind(pairTrackAddress)
  let rewardTokenValue: Address = Address.fromString(ADDRESS_ZERO) // Basic types cannot be nullable
  let rewardTokenResult = contract.try_REWARD()
  if (!rewardTokenResult.reverted) {
    rewardTokenValue = rewardTokenResult.value
  }
  return rewardTokenValue
}

export function createPairTrack(trackAddress: Address, pairAddress: Address, event: ethereum.Event): PairFeesTrack {
  let feesTrack = PairFeesTrack.load(trackAddress.toHexString())

  if (feesTrack === null) {
    feesTrack = new PairFeesTrack(trackAddress.toHexString())
    feesTrack.pair = pairAddress.toHexString()
    feesTrack.accumulatedETH = ZERO_BD
    feesTrack.accumulatedUSD = ZERO_BD
    feesTrack.txCount = ZERO_BI
    feesTrack.createdAtBlockNumber = event.block.number
    feesTrack.createdAtTimestamp = event.block.timestamp

    feesTrack.syncBlockNumber = event.block.number

    let feeTokenAddress = fetchPairFeeRewardToken(trackAddress)
    if (feeTokenAddress.toHexString() !== ADDRESS_ZERO) {
      let feeToken = createOrGetToken(feeTokenAddress, event.block.number)
      feesTrack.feeToken = feeToken.id
    }

    feesTrack.save()
  }
  return feesTrack as PairFeesTrack
}

export function createOrGetUserFee(account: Address): UserFee {
  let userFees = UserFee.load(account.toHexString())
  if (userFees === null) {
    userFees = new UserFee(account.toHexString())
    userFees.usdClaimFees = ZERO_BD

    userFees.save()
  }
  return userFees as UserFee
}

export function createOrGetUserPairFee(account: Address, pairAddress: Address): UserPairFee {
  let pairFeesId = account.toHexString().concat('-').concat(pairAddress.toHexString())
  let pairFees = UserPairFee.load(pairFeesId)
  if (pairFees === null) {
    pairFees = new UserPairFee(pairFeesId)
    pairFees.user = account.toHexString()
    pairFees.pair = pairAddress.toHexString()
    pairFees.accumulatedETH = ZERO_BD
    pairFees.accumulatedUSD = ZERO_BD
    pairFees.txCount = ZERO_BI

    pairFees.save()
  }
  return pairFees as UserPairFee
}