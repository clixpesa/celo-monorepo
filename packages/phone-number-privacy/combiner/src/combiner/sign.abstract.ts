import {
  DomainRestrictedSignatureRequest,
  DomainRestrictedSignatureResponseSuccess,
  ErrorMessage,
  ErrorType,
  KEY_VERSION_HEADER,
  OdisResponse,
  SignMessageRequest,
  SignMessageResponseSuccess,
  WarningMessage
} from '@celo/phone-number-privacy-common'
import Logger from 'bunyan'
import { Request } from 'express'
import { HeaderInit, Response as FetchResponse } from 'node-fetch'
import { CombineAction } from './combine.action'
import { Session } from './session'

export type SignatureRequest = SignMessageRequest | DomainRestrictedSignatureRequest
export type SignatureResponse<R extends SignatureRequest> = OdisResponse<R>

// tslint:disable-next-line: max-classes-per-file
export abstract class SignAbstract<R extends SignatureRequest> extends CombineAction<R> {
  
  protected headers(request: Request<{}, {}, R>): HeaderInit | undefined {
    return {
      ...super.headers(request),
      [KEY_VERSION_HEADER]: this.keyVersion.toString(),
    }
  }

  protected async receiveSuccess(
    res: SignMessageResponseSuccess | DomainRestrictedSignatureResponseSuccess,
    url: string,
    session: Session<R>
  ): Promise<void> {
    if (!this.io.checkResponseKeyVersion(res, session)) {
      throw new Error(ErrorMessage.INVALID_KEY_VERSION_RESPONSE)
    }

    const status: number = res.status
    const data: string = await signerResponse.text()
    session.logger.info({ url, res: data, status }, 'received OK response from signer')

    // TODO(Alec): Move this up one level
    const res = this.io.validateSignerResponse(data, url, session)

    const signature = res.success ? res.signature : never // TODO(Alec)(Next)

    session.responses.push({ url, res, status })

    session.logger.info({ signer: url }, 'Add signature')
    const signatureAdditionStart = Date.now()
    session.blsCryptoClient.addSignature({ url, signature })
    session.logger.info(
      {
        signer: url,
        hasSufficientSignatures: session.blsCryptoClient.hasSufficientSignatures(),
        additionLatency: Date.now() - signatureAdditionStart,
      },
      'Added signature'
    )
    // Send response immediately once we cross threshold
    // BLS threshold signatures can be combined without all partial signatures
    if (session.blsCryptoClient.hasSufficientSignatures()) {
      try {
        await session.blsCryptoClient.combinePartialBlindedSignatures(
          this.parseBlindedMessage(session.request.body)
        )
        // Close outstanding requests
        session.controller.abort()
      } catch {
        // One or more signatures failed verification and were discarded.
        // Error has already been logged, continue to collect signatures.
      }
    }
  }

  // TODO(Alec): should forward user key version if possible
  protected checkRequestKeyVersion(request: Request<{}, {}, R>, logger: Logger): boolean {
    const keyVersionHeader = request.headers[KEY_VERSION_HEADER]
    logger.info({ keyVersionHeader }, 'User requested with key version')
    if (keyVersionHeader && Number(keyVersionHeader) !== this.keyVersion) {
      return false
    }
    return true
  }

  protected checkResponseKeyVersion(response: FetchResponse, session: Session<R>): boolean {
    const keyVersionHeader = response.headers.get(KEY_VERSION_HEADER)
    session.logger.info({ keyVersionHeader }, 'Signer responded with key version')
    if (keyVersionHeader && Number(keyVersionHeader) !== this.keyVersion) {
      return false
    }
    return true
  }

  protected handleMissingSignatures(session: Session<R>) {
    let error: ErrorType = ErrorMessage.NOT_ENOUGH_PARTIAL_SIGNATURES
    const majorityErrorCode = session.getMajorityErrorCode()
    if (majorityErrorCode === 403 || majorityErrorCode === 429) {
      error = WarningMessage.EXCEEDED_QUOTA
    }
    this.io.sendFailure(error, majorityErrorCode ?? 500, session.response, session.logger)
  }
  // protected abstract logResponseDiscrepancies(session: Session<R>): void
  protected abstract parseBlindedMessage(req: R): string
}