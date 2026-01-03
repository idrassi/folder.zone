// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Nadim Kobeissi <nadim@symbolic.software>

import {
	BINARY_RELAY,
	SIGNALING_PING_INTERVAL,
	SIGNALING_PONG_TIMEOUT
} from "./config.js"

const WS_BUFFER_THRESHOLD = 4 * 1024 * 1024
const WS_BUFFER_CHECK_INTERVAL = 50
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export class Signaling {
	constructor(onMessage, onError, onBinaryRelay, onReconnect, onConnectionChange) {
		this.onMessage = onMessage
		this.onError = onError || (() => {})
		this.onBinaryRelay = onBinaryRelay || (() => {})
		this.onReconnect = onReconnect || (() => {})
		this.onConnectionChange = onConnectionChange || (() => {})
		this.ws = null
		this.peerId = null
		this.room = null
		this.clientId = null
		this.reconnectAttempt = 0
		this.reconnectTimer = null
		this.pingTimer = null
		this.lastPongAt = 0
		this.connected = false
		this.intentionallyClosed = false
	}

	connect(room, clientId) {
		this.room = room
		this.clientId = clientId || null
		this.intentionallyClosed = false
		this._connect()
	}

	_connect() {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:"
		this.ws = new WebSocket(`${protocol}//${location.host}?room=${encodeURIComponent(this.room)}`)
		this.ws.binaryType = "arraybuffer"

		this.ws.onopen = () => {
			this.connected = true
			this.reconnectAttempt = 0
			this.lastPongAt = Date.now()
			this._startHeartbeat()
			this.onConnectionChange("connected")
			this.ws.send(JSON.stringify({
				type: "join",
				room: this.room,
				clientId: this.clientId
			}))
		}

		this.ws.onmessage = (event) => {
			this.lastPongAt = Date.now()
			if (event.data instanceof ArrayBuffer) {
				const bytes = new Uint8Array(event.data)
				if (bytes[0] === BINARY_RELAY) {
					const peerIdLen = (bytes[1] << 8) | bytes[2]
					const fromPeerId = new TextDecoder().decode(bytes.slice(3, 3 + peerIdLen))
					const data = bytes.slice(3 + peerIdLen)
					this.onBinaryRelay(fromPeerId, data)
				}
				return
			}

			const msg = JSON.parse(event.data)

			if (msg.type === "pong") {
				return
			}

			if (msg.type === "peer-id") {
				const isReconnect = this.peerId !== null && this.peerId !== msg.peerId
				this.peerId = msg.peerId
				if (isReconnect) {
					this.onReconnect()
				}
				return
			}

			if (msg.type === "error") {
				this.onError(msg.message)
				return
			}

			this.onMessage(msg)
		}

		this.ws.onclose = () => {
			if (this.intentionallyClosed) return
			this._stopHeartbeat()
			this.connected = false
			this.onConnectionChange("disconnected")
			this._scheduleReconnect()
		}

		this.ws.onerror = () => {}
	}

	_scheduleReconnect() {
		if (this.reconnectTimer) return

		const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
		this.reconnectAttempt++

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			if (!this.intentionallyClosed) {
				this._connect()
			}
		}, delay)
	}

	_startHeartbeat() {
		this._stopHeartbeat()
		this.pingTimer = setInterval(() => {
			this._sendPing()
		}, SIGNALING_PING_INTERVAL)
	}

	_stopHeartbeat() {
		if (this.pingTimer) {
			clearInterval(this.pingTimer)
			this.pingTimer = null
		}
	}

	_sendPing() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
		const now = Date.now()
		if (this.lastPongAt && now - this.lastPongAt > SIGNALING_PONG_TIMEOUT) {
			this.ws.close()
			return
		}
		this.ws.send(JSON.stringify({
			type: "ping"
		}))
	}

	isConnected() {
		return !!this.ws && this.ws.readyState === WebSocket.OPEN
	}

	send(msg) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg))
			return true
		}
		return false
	}

	async sendBinaryRelay(targetPeerId, data) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return false
		}

		while (this.ws.bufferedAmount > WS_BUFFER_THRESHOLD) {
			await new Promise((r) => setTimeout(r, WS_BUFFER_CHECK_INTERVAL))
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				return false
			}
		}

		const peerIdBytes = new TextEncoder().encode(targetPeerId)
		const msg = new Uint8Array(3 + peerIdBytes.length + data.length)
		msg[0] = BINARY_RELAY
		msg[1] = (peerIdBytes.length >> 8) & 0xff
		msg[2] = peerIdBytes.length & 0xff
		msg.set(peerIdBytes, 3)
		msg.set(data, 3 + peerIdBytes.length)
		this.ws.send(msg)
		return true
	}

	close() {
		this.intentionallyClosed = true
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		this._stopHeartbeat()
		this.connected = false
		this.onConnectionChange("disconnected")
		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
	}
}
