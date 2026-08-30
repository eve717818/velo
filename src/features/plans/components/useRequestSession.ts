import { useEffect, useMemo } from "react"

export interface RequestSession {
  beginRequest: () => number
  invalidate: () => void
  isCurrent: (token: number) => boolean
}

function createRequestSession(): RequestSession {
  let token = 0

  return {
    beginRequest() {
      token += 1
      return token
    },
    invalidate() {
      token += 1
    },
    isCurrent(requestToken: number) {
      return requestToken === token
    },
  }
}

export function useRequestSession(sessionKey?: string): RequestSession {
  const requestSession = useMemo(() => {
    void sessionKey
    return createRequestSession()
  }, [sessionKey])

  useEffect(() => () => {
    requestSession.invalidate()
  }, [requestSession])

  return requestSession
}
