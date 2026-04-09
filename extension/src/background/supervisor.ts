import type { ServiceWorkerMessage } from '../lib/types'

export interface SupervisorOptions {
  timeoutMs: number
  onTimeout: (port: chrome.runtime.Port) => void
}

export class RequestSupervisor {
  private timers: Map<chrome.runtime.Port, number> = new Map()

  constructor(private options: SupervisorOptions) {}

  start(port: chrome.runtime.Port) {
    this.stop(port)
    this.timers.set(port, this.createTimer(port))
  }

  touch(port: chrome.runtime.Port) {
    if (!this.timers.has(port)) {
      return
    }

    this.stop(port)
    this.timers.set(port, this.createTimer(port))
  }

  stop(port: chrome.runtime.Port) {
    const timer = this.timers.get(port)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(port)
    }
  }

  private createTimer(port: chrome.runtime.Port): number {
    return setTimeout(() => {
      console.warn('[RequestSupervisor] Request timed out, forcing settlement')
      this.options.onTimeout(port)
      this.stop(port)
    }, this.options.timeoutMs)
  }
}
