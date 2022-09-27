/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import {
  ZERO_BD,
  factoryContract,
  ADDRESS_ZERO,
  ONE_BD,
  UNTRACKED_PAIRS,
  WHITELIST_TOKENS,
  STABLE_COINS,
  safeDiv
} from './helpers'

// lowcase
const WETH_ADDRESS = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
const USDT_WETH_PAIR = '0xcfe0b8a7cbc0700d6e21ca9550f3c3fabd803973'
const BUSDT_WETH_PAIR = '0xdb557f72f54ba8c274081bdc18fe7d2f7b1462b0'
const DAI_WETH_PAIR = '0x17f73750231eb285340e055bdb7810846efb7b14'

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdtPair = Pair.load(USDT_WETH_PAIR) // usdt is token0, wbnb is token1
  let busdPair = Pair.load(BUSDT_WETH_PAIR) // busd is token1, wbnb is token0
  let daiPair = Pair.load(DAI_WETH_PAIR) // dai is token0, wbnb is token1

  // all 3 have been created
  if (busdPair !== null && daiPair !== null && usdtPair !== null) {
    let totalLiquidityETH = busdPair.reserve0.plus(daiPair.reserve1).plus(usdtPair.reserve1)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityETH)
    let busdWeight = busdPair.reserve0.div(totalLiquidityETH)
    let daiWeight = daiPair.reserve1.div(totalLiquidityETH)
    return busdPair.token1Price
      .times(busdWeight)
      .plus(daiPair.token0Price.times(daiWeight))
      .plus(usdtPair.token0Price.times(usdtWeight))
  } else if (busdPair !== null && usdtPair !== null) {
    let totalLiquidityETH = busdPair.reserve0.plus(usdtPair.reserve1)
    let busdWeight = busdPair.reserve0.div(totalLiquidityETH)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityETH)
    return busdPair.token1Price.times(busdWeight).plus(usdtPair.token0Price.times(usdtWeight))
    // BUSD is the only pair so far
  } else if (usdtPair !== null) {
    return usdtPair.token0Price
  } else {
    return ZERO_BD
  }
}

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('100000')

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }

  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle!.ethPrice)
  } else {
    // loop through whitelist and check if paired with any
    for (let i = 0; i < WHITELIST_TOKENS.length; ++i) {
      let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST_TOKENS[i]))
      if (pairAddress.toHexString() != ADDRESS_ZERO) {
        let pair = Pair.load(pairAddress.toHexString()) as Pair
        if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
          let token1 = Token.load(pair.token1) as Token
          priceSoFar = pair.token1Price.times(token1.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
        }
        if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
          let token0 = Token.load(pair.token0) as Token
          priceSoFar = pair.token0Price.times(token0.derivedETH as BigDecimal) // return token0 per our token * ETH per token 0
        }
      }
    }
  }
  return priceSoFar // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH!.times(bundle!.ethPrice)
  let price1 = token1.derivedETH!.times(bundle!.ethPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH!.times(bundle!.ethPrice)
  let price1 = token1.derivedETH!.times(bundle!.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
