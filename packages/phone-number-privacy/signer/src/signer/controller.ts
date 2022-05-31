import { ErrorMessage, OdisRequest, OdisResponse } from '@celo/phone-number-privacy-common'
import { Request, Response } from 'express'
import { Counters } from '../common/metrics'
import { IAction } from './action.interface'

export class Controller<R extends OdisRequest> {
  constructor(readonly action: IAction<R>) {}

  public async handle(
    request: Request<{}, {}, unknown>,
    response: Response<OdisResponse<R>>
  ): Promise<void> {
    Counters.requests.labels(this.action.io.endpoint).inc()
    try {
      const session = await this.action.io.init(request, response)
      if (session) {
        await this.action.perform(session)
      }
    } catch (err) {
      response.locals
        .logger()
        .error({ error: err }, `Unknown error in handler for ${this.action.io.endpoint}`)
      this.action.io.sendFailure(ErrorMessage.UNKNOWN_ERROR, 500, response)
    }
  }
}