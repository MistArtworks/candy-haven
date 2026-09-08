import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import {
  IPC_EVENT,
  IPC_INVOKE,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type InvokeInput,
  type InvokeOutput,
  type IpcResponse
} from '@shared/ipc/contract'
import { AppError, ErrorCode, serializeError } from '@main/core/errors'
import { getLogger } from '@main/core/logger'

const logger = getLogger('ipc')

export type InvokeHandler<C extends InvokeChannel> = (
  input: InvokeInput<C>,
  event: IpcMainInvokeEvent
) => Promise<InvokeOutput<C>> | InvokeOutput<C>

/**
 * Typed IPC boundary.
 *
 * Every request is validated against the shared contract on the way in and the
 * way out, and every handler result is wrapped in a success/failure envelope so
 * errors cross the boundary as structured data rather than opaque strings.
 * Unhandled exceptions can therefore never crash the main process from a
 * renderer call.
 */
export class IpcRouter {
  private readonly registered = new Set<InvokeChannel>()

  handle<C extends InvokeChannel>(channel: C, handler: InvokeHandler<C>): void {
    if (this.registered.has(channel)) {
      throw new Error(`IPC channel already registered: ${channel}`)
    }
    this.registered.add(channel)

    ipcMain.handle(channel, async (event, rawInput): Promise<IpcResponse<unknown>> => {
      const contract = IPC_INVOKE[channel]

      const parsedInput = contract.input.safeParse(rawInput)
      if (!parsedInput.success) {
        const error = new AppError(`Invalid payload for "${channel}".`, {
          code: ErrorCode.Validation,
          recoverable: false
        })
        logger.warn(`Rejected ${channel}:`, parsedInput.error.issues)
        return { ok: false, error: serializeError(error, is.dev) }
      }

      try {
        const result = await handler(parsedInput.data as InvokeInput<C>, event)

        // Validating the response catches contract drift during development
        // rather than surfacing as a confusing runtime error in the renderer.
        const parsedOutput = contract.output.safeParse(result)
        if (!parsedOutput.success) {
          logger.error(
            `Handler for ${channel} returned an invalid shape`,
            parsedOutput.error.issues
          )
          if (is.dev) {
            return {
              ok: false,
              error: serializeError(
                new AppError(`Handler for "${channel}" returned an invalid shape.`, {
                  code: ErrorCode.Validation
                }),
                true
              )
            }
          }
        }

        return { ok: true, data: parsedOutput.success ? parsedOutput.data : result }
      } catch (error) {
        const appError = AppError.from(error)
        logger.error(`Handler for ${channel} failed: ${appError.message}`, appError)
        return { ok: false, error: serializeError(appError, is.dev) }
      }
    })
  }

  /** Broadcasts an event to every live renderer. */
  broadcast<C extends EventChannel>(channel: C, payload: EventPayload<C>): void {
    const contract = IPC_EVENT[channel]
    const parsed = contract.safeParse(payload)

    if (!parsed.success) {
      logger.error(`Refusing to broadcast malformed ${channel}`, parsed.error.issues)
      return
    }

    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed()) continue
      contents.send(channel, parsed.data)
    }
  }

  dispose(): void {
    for (const channel of this.registered) {
      ipcMain.removeHandler(channel)
    }
    this.registered.clear()
  }
}
