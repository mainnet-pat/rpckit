'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActiveSubscription, SubscriptionEvent } from '../types.js'
import { generateId } from '../constants.js'

type SubscribeFn = (
  method: string,
  ...args: [...unknown[], (data: unknown) => void]
) => Promise<() => Promise<void>>

export interface UseSubscriptionResult {
  subscriptions: ActiveSubscription[]
  events: SubscriptionEvent[]
  subscribe: (
    method: string,
    params: unknown[],
    subscribeFn: SubscribeFn
  ) => Promise<string>
  unsubscribe: (subscriptionId: string) => Promise<void>
  unsubscribeAll: () => Promise<void>
  clearEvents: () => void
}

const MAX_EVENTS = 100

export function useSubscription(): UseSubscriptionResult {
  const [subscriptions, setSubscriptions] = useState<ActiveSubscription[]>([])
  const [events, setEvents] = useState<SubscriptionEvent[]>([])
  const subscriptionsRef = useRef<Map<string, ActiveSubscription>>(new Map())

  const addEvent = useCallback(
    (subscriptionId: string, subscriptionType: string, data: unknown) => {
      const event: SubscriptionEvent = {
        id: generateId(),
        subscriptionId,
        subscriptionType,
        data,
        timestamp: new Date(),
      }
      setEvents((prev) => {
        const next = [event, ...prev]
        if (next.length > MAX_EVENTS) {
          return next.slice(0, MAX_EVENTS)
        }
        return next
      })
    },
    []
  )

  const subscribe = useCallback(
    async (
      method: string,
      params: unknown[],
      subscribeFn: SubscribeFn
    ): Promise<string> => {
      const subscriptionId = generateId()

      const unsubscribeFn = await subscribeFn(method, ...params, (data: unknown) => {
        addEvent(subscriptionId, method, data)
      })

      const subscription: ActiveSubscription = {
        id: subscriptionId,
        method,
        params,
        unsubscribe: unsubscribeFn,
      }

      subscriptionsRef.current.set(subscriptionId, subscription)
      setSubscriptions(Array.from(subscriptionsRef.current.values()))

      return subscriptionId
    },
    [addEvent]
  )

  const unsubscribe = useCallback(async (subscriptionId: string) => {
    const subscription = subscriptionsRef.current.get(subscriptionId)
    if (subscription) {
      try {
        await subscription.unsubscribe()
      } catch {
        // Ignore unsubscribe errors
      }
      subscriptionsRef.current.delete(subscriptionId)
      setSubscriptions(Array.from(subscriptionsRef.current.values()))
    }
  }, [])

  const unsubscribeAll = useCallback(async () => {
    const promises = Array.from(subscriptionsRef.current.values()).map((sub) =>
      sub.unsubscribe().catch(() => {})
    )
    await Promise.all(promises)
    subscriptionsRef.current.clear()
    setSubscriptions([])
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  return {
    subscriptions,
    events,
    subscribe,
    unsubscribe,
    unsubscribeAll,
    clearEvents,
  }
}
