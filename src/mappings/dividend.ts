/* eslint-disable prefer-const */
import { log, BigInt, Address } from '@graphprotocol/graph-ts'
import { Claim } from '../types/templates/PairDividend/PairDividend'
import { Bundle, Pair, Token, PairFeesTrack, Claim as ClaimEvent } from '../types/schema'
import {
  ZERO_BI,
  ONE_BI,
  createOrGetTransaction,
  convertTokenToDecimal,
  createOrGetUserFee,
  createOrGetUserPairFee,
  ZERO_BD,
} from './helpers'

export function handleClaim(event: Claim): void {

  if (event.params.amount.equals(ZERO_BI)) {
    return
  }

  let pairTrack = PairFeesTrack.load(event.address.toHex()) as PairFeesTrack
  let token = Token.load(pairTrack.feeToken) as Token

  let bundle = Bundle.load('1') as Bundle

  // get or create transaction
  let transaction = createOrGetTransaction(event)
  let claims = transaction.claims
  let claim = new ClaimEvent(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(claims.length).toString())
  )
  claim.transaction = transaction.id
  claim.timestamp = transaction.timestamp
  claim.logIndex = event.logIndex

  claim.pairTrack = pairTrack.id
  
  let tokenAmount = convertTokenToDecimal(event.params.amount, token.decimals)
  claim.amount = tokenAmount
  claim.automatic = event.params.automatic

  let derivedAmountETH = token.derivedETH!.times(tokenAmount)
  let derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)
  claim.amountUSD = derivedAmountUSD

  let account = event.params.account
  let userFee = createOrGetUserFee(account)
  claim.user = userFee.id

  claim.save()

  // update the transaction
  claims.push(claim.id)
  transaction.claims =  claims
  transaction.save()

  // update for user fees
  userFee.usdClaimFees = userFee.usdClaimFees.plus(derivedAmountUSD)
  userFee.save()

  // update for user pair fees
  let userPairFee = createOrGetUserPairFee(account, Address.fromString(pairTrack.pair))
  userPairFee.accumulatedETH = userPairFee.accumulatedETH.plus(derivedAmountETH)
  userPairFee.accumulatedUSD = userPairFee.accumulatedETH.plus(derivedAmountUSD)
  userPairFee.txCount = userPairFee.txCount.plus(ONE_BI)
  userPairFee.save()

  // update pair track
  pairTrack.accumulatedETH = pairTrack.accumulatedETH.plus(derivedAmountETH)
  pairTrack.accumulatedUSD = pairTrack.accumulatedUSD.plus(derivedAmountUSD)
  pairTrack.txCount = pairTrack.txCount.plus(ONE_BI)
  pairTrack.save()
}
