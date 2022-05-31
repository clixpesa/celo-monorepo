import {
  CombinerEndpoint,
  DisableDomainRequest,
  DisableDomainResponse,
  DisableDomainResponseFailure,
  DisableDomainResponseSuccess,
  DomainState,
  ErrorType,
  getSignerEndpoint,
  send,
  SignerEndpoint,
  verifyDisableDomainRequestAuthenticity,
  WarningMessage,
} from '@celo/phone-number-privacy-common'
import { Request, Response } from 'express'
import { VERSION } from '../../config'
import { IOAbstract } from '../io.abstract'
import { Session } from '../session'

export class DomainDisableIO extends IOAbstract<DisableDomainRequest> {
  readonly endpoint: CombinerEndpoint = CombinerEndpoint.DISABLE_DOMAIN
  readonly signerEndpoint: SignerEndpoint = getSignerEndpoint(this.endpoint)

  async init(
    request: Request<{}, {}, unknown>,
    response: Response<DisableDomainResponse>
  ): Promise<Session<DisableDomainRequest> | null> {
    if (!super.inputChecks(request, response)) {
      return null
    }
    if (!(await this.authenticate(request))) {
      this.sendFailure(WarningMessage.UNAUTHENTICATED_USER, 401, response)
      return null
    }
    return new Session(request, response, undefined)
  }

  authenticate(request: Request<{}, {}, DisableDomainRequest>): Promise<boolean> {
    return Promise.resolve(verifyDisableDomainRequestAuthenticity(request.body))
  }

  sendSuccess(
    status: number,
    response: Response<DisableDomainResponseSuccess>,
    domainState: DomainState
  ) {
    send(
      response,
      {
        success: true,
        version: VERSION,
        status: domainState,
      },
      status,
      response.locals.logger()
    )
  }

  sendFailure(
    error: ErrorType,
    status: number,
    response: Response<DisableDomainResponseFailure>,
    domainState?: DomainState
  ) {
    send(
      response,
      {
        success: false,
        version: VERSION,
        error,
        status: domainState,
      },
      status,
      response.locals.logger()
    )
  }
}