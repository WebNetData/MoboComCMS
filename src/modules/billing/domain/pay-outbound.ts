/** Only emitted before any application POST was constructed or sent. */
export class PayCallbackNotSentError extends Error {
  constructor(){super('PAY_CALLBACK_NOT_SENT');this.name='PayCallbackNotSentError'}
}
export const botRetryDelay=(attempts:number)=>Math.min(15*60_000,30_000*2**Math.min(5,Math.max(0,attempts-1)))
