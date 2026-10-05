import { setupServer } from 'msw/node'

// No default handlers: every test explicitly declares the HTTP contract it needs.
export const server = setupServer()
