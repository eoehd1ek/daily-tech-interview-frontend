import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'
import { server } from './server'

const unhandledRequests: string[] = []

beforeAll(() => {
  server.listen({
    onUnhandledRequest(request, print) {
      unhandledRequests.push(`${request.method} ${request.url}`)
      // MSW's error strategy prevents network passthrough.
      print.error()
    },
  })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.useRealTimers()
  const requests = unhandledRequests.splice(0)
  // Fail even when the application catches an unhandled request as a network error.
  expect(requests, 'Every HTTP request must have an explicit MSW handler').toEqual([])
})

afterAll(() => server.close())
