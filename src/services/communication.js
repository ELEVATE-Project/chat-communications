const httpStatusCode = require('@generics/http-status')
const apiResponses = require('@constants/api-responses')
const responses = require('@helpers/responses')
const { usernameHash, passwordHash } = require('@generics/utils')
const chatAPIs = require('@requests/rocketchat')
const userQueries = require('../database/queries/user')

/**
 * Helper class for handling communication-related operations with Rocket.Chat API.
 */
module.exports = class CommunicationHelper {
	/**
	 * Registers a new user in the chat platform and stores user details in the database.
	 *
	 * @param {Object} bodyData - The user data.
	 * @param {string} bodyData.user_id - The user ID.
	 * @param {string} bodyData.name - The user's name.
	 * @param {string} bodyData.email - The user's email address.
	 * @param {string} [bodyData.image_url] - Optional URL for the user's avatar image.
	 * @returns {Promise<Object>} Response with status and chat signup result.
	 */
	static async signup(bodyData) {
		const userExists = await userQueries.findOne({ user_id: bodyData.user_id })
		if (userExists) {
			return responses.successResponse({
				statusCode: httpStatusCode.created,
				message: 'USER_ALREADY_EXISTS',
				result: userExists,
			})
		}
		let chatResponse = await chatAPIs.signup(
			bodyData.name,
			usernameHash(bodyData.user_id),
			passwordHash(bodyData.user_id),
			bodyData.email
		)
		await userQueries.create({
			user_id: bodyData.user_id,
			user_info: {
				external_user_id: chatResponse.user_id,
			},
		})

		if (bodyData.image_url) {
			await chatAPIs.setAvatar(usernameHash(bodyData.user_id), bodyData.image_url)
		}
		return responses.successResponse({
			statusCode: httpStatusCode.created,
			message: 'USER_CREATED_SUCCESSFULLY',
			result: chatResponse,
		})
	}

	/**
	 * Logs in an existing user to the chat platform.
	 *
	 * @param {Object} bodyData - The login data.
	 * @param {string} bodyData.user_id - The user ID.
	 * @returns {Promise<Object>} Response with status and login result.
	 */
	static async login(bodyData) {
		try {
			let chatResponse = await chatAPIs.login(usernameHash(bodyData.user_id), passwordHash(bodyData.user_id))
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'LOGGED_IN',
				result: chatResponse,
			})
		} catch (error) {
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			} else {
				console.error('An error occurred:', error.message)
				throw error
			}
		}
	}

	/**
	 * Logs out a user from the chat platform. Logs out all active sessions if no token is provided.
	 *
	 * @param {Object} bodyData - The logout data.
	 * @param {string} bodyData.user_id - The user ID.
	 * @param {string} [bodyData.token] - The auth token for logout; if not provided, all sessions are logged out.
	 * @returns {Promise<Object>} Response with status and logout result.
	 */
	static async logout(bodyData) {
		try {
			let chatResponse
			if (bodyData.token) {
				chatResponse = await chatAPIs.logout(bodyData.user_id, bodyData.token)
			} else {
				const loginResponse = await chatAPIs.login(
					usernameHash(bodyData.user_id),
					passwordHash(bodyData.user_id)
				)
				await chatAPIs.logoutOtherClients(loginResponse.user_id, loginResponse.auth_token)
				chatResponse = await chatAPIs.logout(loginResponse.user_id, loginResponse.auth_token)
			}
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'LOGGED_OUT',
				result: chatResponse,
			})
		} catch (error) {
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			} else {
				console.error('An error occurred:', error.message)
				throw error
			}
		}
	}

	/**
	 * Creates a chat room between two users and sends an initial message.
	 *
	 * @param {Object} bodyData - The room creation data.
	 * @param {string[]} bodyData.usernames - Array with two usernames to add to the chat room.
	 * @param {string} bodyData.initial_message - The initial message to send in the chat room.
	 * @returns {Promise<Object>} Response with status and room creation result.
	 */
	static async createRoom(bodyData) {
		try {
			const userA = usernameHash(bodyData.usernames[0])
			const userB = usernameHash(bodyData.usernames[1])
			let users = [userA, userB]

			let chatResponse = await chatAPIs.initiateChatRoom(users)

			await chatAPIs.sendMessage(
				userA,
				passwordHash(bodyData.usernames[0]),
				chatResponse.room.room_id,
				bodyData.initial_message
			)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'LOGGED_IN',
				result: chatResponse,
			})
		} catch (error) {
			if (error.message === 'invalid-users') {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			} else {
				console.error('An error occurred:', error)
				throw error
			}
		}
	}

	/**
	 * Updates the avatar image for a specific user on the chat platform.
	 *
	 * @param {string} userId - The user ID whose avatar needs updating.
	 * @param {string} imageUrl - The URL of the new avatar image.
	 * @returns {Promise<Object>} Response with status and avatar update result.
	 */
	static async updateAvatar(userId, imageUrl) {
		try {
			let chatResponse = await chatAPIs.setAvatar(usernameHash(userId), imageUrl)
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
