import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RequestSupervisor } from '../../src/background/supervisor'

describe('RequestSupervisor', () => {
  let supervisor: RequestSupervisor
  let mockPort: any

  beforeEach(() => {
    mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    }
    supervisor = new RequestSupervisor({
      timeoutMs: 100,
      onTimeout: (port) => {
        port.postMessage({ type: 'SETTLEMENT', status: 'ERROR' })
      },
    })
  })

  it('should trigger onTimeout when timeout is reached', async () => {
    supervisor.start(mockPort)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'SETTLEMENT', status: 'ERROR' })
  })

  it('should not trigger onTimeout if stopped before timeout', async () => {
    supervisor.start(mockPort)
    supervisor.stop(mockPort)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(mockPort.postMessage).not.toHaveBeenCalled()
  })
})
