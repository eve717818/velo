import { useEffect, useRef } from "react"

export function useRequestSession() {
  const tokenRef = useRef(0)

  useEffect(() => () => { tokenRef.current += 1 }, [])

  function beginRequest() {
    tokenRef.current += 1
    return tokenRef.current
  }

  function invalidate() {
    tokenRef.current += 1
  }

  function isCurrent(token: number) {
    return token === tokenRef.current
  }

  return { beginRequest, invalidate, isCurrent }
}
