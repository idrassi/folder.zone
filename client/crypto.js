// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Nadim Kobeissi <nadim@symbolic.software>

const HMAC_INFO = new TextEncoder().encode("file-hmac")
const CHUNK_HMAC_INFO = new TextEncoder().encode("file-hmac-chunk-v1")
const FINAL_HMAC_INFO = new TextEncoder().encode("file-hmac-final-v1")
export const HMAC_SIZE = 32

function toUint8Array(data) {
	if (data instanceof Uint8Array) {
		return data
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data)
	}
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
	}
	throw new TypeError("Expected ArrayBuffer or typed array")
}

function concatUint8Arrays(parts) {
	let totalLength = 0
	for (const part of parts) {
		totalLength += part.length
	}
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const part of parts) {
		result.set(part, offset)
		offset += part.length
	}
	return result
}

export function bufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer)
	const chars = new Array(bytes.length)
	for (let i = 0; i < bytes.length; i++) {
		chars[i] = String.fromCharCode(bytes[i])
	}
	return btoa(chars.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export function base64ToBuffer(base64) {
	const padded = base64.replace(/-/g, "+").replace(/_/g, "/")
	const paddingNeeded = (4 - (padded.length % 4)) % 4
	const fullyPadded = padded + "=".repeat(paddingNeeded)
	const binary = atob(fullyPadded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

function buildChunkHMACInput(chunkIndex, totalChunks, chunkData) {
	if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
		throw new Error(`Invalid chunk index: ${chunkIndex}`)
	}
	if (!Number.isInteger(totalChunks) || totalChunks < 1) {
		throw new Error(`Invalid total chunks: ${totalChunks}`)
	}
	const chunkBytes = toUint8Array(chunkData)
	const header = new Uint8Array(12)
	const view = new DataView(header.buffer)
	view.setUint32(0, chunkIndex, true)
	view.setUint32(4, totalChunks, true)
	view.setUint32(8, chunkBytes.length, true)
	return concatUint8Arrays([CHUNK_HMAC_INFO, header, chunkBytes])
}

export function buildFinalHMACInput(chunkTags) {
	return concatUint8Arrays([FINAL_HMAC_INFO, toUint8Array(chunkTags)])
}

export async function generateKey() {
	const key = await crypto.subtle.generateKey({
		name: "AES-GCM",
		length: 256
	}, true, ["encrypt", "decrypt"])
	const exported = await crypto.subtle.exportKey("raw", key)
	return bufferToBase64(exported)
}

export async function importKey(base64Key) {
	const keyBuffer = base64ToBuffer(base64Key)
	if (keyBuffer.length !== 32) {
		throw new Error("Invalid key length: expected 32 bytes for AES-256")
	}
	return crypto.subtle.importKey("raw", keyBuffer, {
		name: "AES-GCM",
		length: 256
	}, true, ["encrypt", "decrypt"])
}

export async function encrypt(key, data) {
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const encrypted = await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv
	}, key, data)
	const result = new Uint8Array(iv.length + encrypted.byteLength)
	result.set(iv)
	result.set(new Uint8Array(encrypted), iv.length)
	return result
}

export async function decrypt(key, data) {
	if (data.length < 28) {
		throw new Error("Invalid ciphertext: data too short")
	}
	const iv = data.slice(0, 12)
	const encrypted = data.slice(12)
	const decrypted = await crypto.subtle.decrypt({
		name: "AES-GCM",
		iv
	}, key, encrypted)
	return new Uint8Array(decrypted)
}

export function generateRoomId() {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	return bufferToBase64(bytes)
}

export function generatePeerId() {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	return bufferToBase64(bytes)
}

export function generateNonce() {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	return bufferToBase64(bytes)
}

export async function deriveHMACKey(sessionKey, nonce) {
	const sessionKeyBytes = await crypto.subtle.exportKey("raw", sessionKey)
	const nonceBytes = base64ToBuffer(nonce)
	const keyMaterial = await crypto.subtle.importKey("raw", sessionKeyBytes, {
		name: "HKDF"
	}, false, ["deriveKey"])

	return crypto.subtle.deriveKey({
		name: "HKDF",
		hash: "SHA-256",
		salt: nonceBytes,
		info: HMAC_INFO
	}, keyMaterial, {
		name: "HMAC",
		hash: "SHA-256",
		length: 256
	}, false, ["sign", "verify"])
}

export async function computeChunkHMACTag(hmacKey, chunkIndex, totalChunks, chunkData) {
	const input = buildChunkHMACInput(chunkIndex, totalChunks, chunkData)
	const signature = await crypto.subtle.sign("HMAC", hmacKey, input)
	return new Uint8Array(signature)
}

export async function computeHMAC(hmacKey, data) {
	const hmac = await crypto.subtle.sign("HMAC", hmacKey, toUint8Array(data))
	return bufferToBase64(new Uint8Array(hmac))
}

export async function verifyHMAC(hmacKey, data, expectedHMAC) {
	const expectedBytes = base64ToBuffer(expectedHMAC)
	if (expectedBytes.length !== HMAC_SIZE) {
		return false
	}
	return crypto.subtle.verify("HMAC", hmacKey, expectedBytes, toUint8Array(data))
}