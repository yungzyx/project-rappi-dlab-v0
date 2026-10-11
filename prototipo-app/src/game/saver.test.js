import { describe, expect, test, vi } from 'vitest'
import { createSaver } from './saver.js'

/** Una petición que se resuelve o falla cuando el test lo decide. */
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('guardado de a una petición', () => {
  test('sends one request at a time and only the latest state', async () => {
    const calls = []
    const send = vi.fn((state) => {
      const call = { state, ...deferred() }
      calls.push(call)
      return call.promise
    })
    const saver = createSaver(send)

    saver.save({ xp: 10 })
    saver.save({ xp: 20 })
    const last = saver.save({ xp: 30 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(calls[0].state).toEqual({ xp: 10 })
    expect(saver.pending()).toBe(true)

    calls[0].resolve()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(calls[1].state).toEqual({ xp: 30 }) // el 20 se saltó: solo importa el último
    expect(send).toHaveBeenCalledTimes(2)

    calls[1].resolve()
    await last
    expect(saver.pending()).toBe(false)
    expect(send).toHaveBeenCalledTimes(2)
  })

  test('a failed save is retried with the next save', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(undefined)
    const saver = createSaver(send)

    await saver.save({ xp: 10 })
    expect(saver.pending()).toBe(true) // quedó pendiente
    expect(send).toHaveBeenCalledTimes(1)

    await saver.save({ xp: 20 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ xp: 20 })
    expect(saver.pending()).toBe(false)
  })

  test('a state that arrives while a save fails is still sent next time', async () => {
    const first = deferred()
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const saver = createSaver(send)

    const running = saver.save({ xp: 10 })
    saver.save({ xp: 20 })
    first.reject(new Error('sin red'))
    await running
    expect(send).toHaveBeenCalledTimes(1)
    expect(saver.pending()).toBe(true)

    await saver.save({ xp: 30 })
    expect(send).toHaveBeenLastCalledWith({ xp: 30 })
    expect(saver.pending()).toBe(false)
  })
})

describe('guardado: bordes', () => {
  test('a send that throws right away counts as a failure and the next save still goes out', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('en seco')
      })
      .mockResolvedValue(undefined)
    const saver = createSaver(send)
    await saver.save({ xp: 1 })
    expect(saver.pending()).toBe(true)
    await saver.save({ xp: 2 })
    expect(send).toHaveBeenLastCalledWith({ xp: 2 })
    expect(saver.pending()).toBe(false)
  })
})
