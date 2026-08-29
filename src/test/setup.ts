import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

if (typeof HTMLDialogElement !== "undefined") {
  if (!("showModal" in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      value: function showModal(this: HTMLDialogElement) {
        this.open = true
      },
    })
  }

  if (!("close" in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      value: function close(this: HTMLDialogElement) {
        this.open = false
      },
    })
  }
}

afterEach(() => cleanup())
