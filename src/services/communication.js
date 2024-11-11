const httpStatusCode = require('@generics/http-status')
const apiResponses = require('@constants/api-responses')
const responses = require('@helpers/responses')
const chatAPIs = require('@requests/rocketchat')
const crypto = require('crypto')
const userQueries = require('../database/queries/user')
// Generate a short hash
function generateShortHash(input) {
	return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8) // Shorten the hash to 8 characters
}
module.exports = class EmailHelper {
	static async signup(bodyData) {
		const userExists = await userQueries.findOne({ user_id: bodyData.user_id })
		if (userExists) {
			return responses.successResponse({
				statusCode: httpStatusCode.created,
				message: 'MAIL_SENT_FAILED',
				result: chatResponse,
			})
		}
		const hash = generateShortHash(bodyData.user_id)
		let chatResponse = await chatAPIs.signup(bodyData.name, hash, hash, bodyData.email)
		if (bodyData.image_url) {
			await chatAPIs.setAvatar(hash, bodyData.image_url)
		}
		return responses.successResponse({
			statusCode: httpStatusCode.created,
			message: 'MAIL_SENT_FAILED',
			result: chatResponse,
		})
	}

	static async login(bodyData) {
		try {
			const hash = generateShortHash(bodyData.user_id)
			let chatResponse = await chatAPIs.login(hash, hash)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'Logged In',
				result: chatResponse,
			})
		} catch (error) {
			// Check if it's the unauthorized error message
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			} else {
				// Handle other errors
				console.error('An error occurred:', error.message)
			}
		}
	}
	static async logout(bodyData) {
		try {
			let chatResponse
			const hash = generateShortHash(bodyData.user_id)
			if (bodyData.token) {
				chatResponse = await chatAPIs.logout(hash, bodyData.token)
			} else {
				const loginResponse = await chatAPIs.login(hash, hash)
				await chatAPIs.logoutOtherClients(loginResponse.user_id, loginResponse.auth_token)
				chatResponse = await chatAPIs.logout(loginResponse.user_id, loginResponse.auth_token)
			}
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: "You've been logged out!",
				result: chatResponse,
			})
		} catch (error) {
			// Check if it's the unauthorized error message
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			} else {
				// Handle other errors
				console.error('An error occurred:', error.message)
			}
		}
	}
	static async createRoom(bodyData) {
		try {
			const hashA = generateShortHash(bodyData.usernames[0])
			const hashB = generateShortHash(bodyData.usernames[1])
			let arr = [hashA, hashB]

			let chatResponse = await chatAPIs.initiateChatRoom(arr)

			await chatAPIs.sendMessage(hashA, hashA, chatResponse.room.room_id, bodyData.initial_message)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'Logged In',
				result: chatResponse,
			})
		} catch (error) {
			// Check if it's the unauthorized error message

			if (error.message === 'invalid-users') {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			} else {
				// Handle other errors
				console.error('An error occurred:', error)
			}
		}
	}
	static async updateAvatar(userId, imageUrl) {
		try {
			const hashA = generateShortHash(userId)

			let chatResponse = await chatAPIs.setAvatar(hashA, imageUrl)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'IMAGE_SET',
				result: chatResponse,
			})
		} catch (error) {
			console.error('An error occurred:', error)
			throw error
		}
	}
}
