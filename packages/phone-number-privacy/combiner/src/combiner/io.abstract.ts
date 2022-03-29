import {
  CombinerEndpoint,
  ErrorType,
  FailureResponse, KEY_VERSION_HEADER,
  OdisRequest,
  OdisResponse, SignerEndpoint, SuccessResponse,
  WarningMessage
} from '@celo/phone-number-privacy-common'
import Logger from 'bunyan'
import { Request, Response } from 'express'
import { OdisConfig } from '../config'
import { Session } from './session'

export abstract class IOAbstract<R extends OdisRequest> {
  abstract readonly endpoint: CombinerEndpoint
  abstract readonly signerEndpoint: SignerEndpoint

  constructor(readonly config: OdisConfig) {}

  abstract init(
    request: Request<{}, {}, unknown>,
    response: Response<OdisResponse<R>>
  ): Promise<Session<R> | null>

  abstract validate(request: Request<{}, {}, unknown>): request is Request<{}, {}, R>

  abstract authenticate(request: Request<{}, {}, R>, logger?: Logger): Promise<boolean>

  abstract sendFailure(
    error: ErrorType,
    status: number,
    response: Response<FailureResponse<R>>,
    ...args: unknown[]
  ): void

  abstract sendSuccess(
    status: number,
    response: Response<SuccessResponse<R>>,
    ...args: unknown[]
  ): void

  abstract validateSignerResponse(
    data: string,
    url: string,
    session: Session<R>
  ): OdisResponse<R>

  getRequestKeyVersion(request: Request<{}, {}, R>, logger: Logger): number | undefined {
    const keyVersionHeader = request.headers[KEY_VERSION_HEADER]
    logger.info({ keyVersionHeader })
    const requestedKeyVersion = Number(keyVersionHeader)
    if (Number.isNaN(requestedKeyVersion)) {
      logger.warn({ keyVersionHeader }, WarningMessage.INVALID_KEY_VERSION_REQUEST)
      return undefined
    }
    return requestedKeyVersion
  }

  protected inputChecks(
    request: Request<{}, {}, unknown>,
    response: Response<OdisResponse<R>>
  ): request is Request<{}, {}, R> {
    if (!this.config.enabled) {
      this.sendFailure(WarningMessage.API_UNAVAILABLE, 503, response)
      return false
    }
    if (!this.validate(request)) {
      this.sendFailure(WarningMessage.INVALID_INPUT, 400, response)
      return false
    }
    return true
  }
}