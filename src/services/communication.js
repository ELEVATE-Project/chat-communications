// Declare chatAPIs variable at a higher scope
let chatAPIs

// Define a map for different chat platforms
const chatPlatformModules = {
	rocketchat: '@requests/rocketchat',
}

// Get the module path based on CHAT_PLATFORM env variable
const chatPlatform = process.env.CHAT_PLATFORM
const modulePath = chatPlatformModules[chatPlatform]

// Dynamically assign to chatAPIs
if (modulePath) {
	chatAPIs = require(modulePath)
} else {
	throw new Error(`Unsupported CHAT_PLATFORM: ${chatPlatform}`)
}

const httpStatusCode = require('@generics/http-status')
const apiResponses = require('@constants/api-responses')
const responses = require('@helpers/responses')
const { usernameHash, passwordHash } = require('@generics/utils')
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
			return responses.failureResponse({
				statusCode: httpStatusCode.conflict,
				message: 'USER_ALREADY_EXISTS',
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
				const userExists = await userQueries.findOne({ user_id: bodyData.user_id })
				if (!userExists) {
					return responses.failureResponse({
						statusCode: httpStatusCode.not_found,
						message: 'USER_DOES_NOT_EXIST',
					})
				}
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
				message: 'CHAT_ROOM_CREATED',
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

	/**
	 * Updates the name of a specific user on the chat platform.
	 *
	 * @param {string} userId - The ID of the user whose name needs to be updated.
	 * @param {string} name - The new name for the user.
	 * @returns {Promise<Object>} A promise that resolves to the response object containing status and result.
	 * @throws {Error} If an error occurs during the update process.
	 */
	static async updateUser(userId, name) {
		try {
			const userDetails = await userQueries.findOne({ user_id: userId })
			if (!userDetails) {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			await chatAPIs.updateUser(userDetails.user_info.external_user_id, name)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'NAME_UPDATED',
				result: { success: true },
			})
		} catch (error) {
			console.error('An error occurred:', error)
			throw error
		}
	}

	/**
	 * Retrieves user details based on the provided user ID and returns a mapped response.
	 *
	 * @param {string} userId - The external user ID to search for in the database.
	 * @returns {Promise<Object>} A promise that resolves to a response object.
	 * The response object will either contain user details or an error message,
	 * depending on the result of the query.
	 *
	 * @throws {Error} If there is any error during the database query or response handling.
	 */
	static async userMapping(userId) {
		try {
			// Fetch user details based on external user ID
			const userDetails = await userQueries.findUserWithJsonbFilter({ user_info_external_user_id: userId })

			// If no user details are found, return a failure response
			if (!userDetails) {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}

			// Return a success response with user details
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'NAME_UPDATED',
				result: {
					user_id: userDetails.user_id,
					external_user_id: userDetails.user_info.external_user_id,
				},
			})
		} catch (error) {
			// Log the error and throw it
			console.error('An error occurred:', error)
			throw error
		}
	}

	/**
	 * Updates the active status of a user on the chat platform (e.g., Rocket.Chat)
	 * using their external user ID, which is retrieved from the database using the provided internal user ID.
	 *
	 * @async
	 * @function setActiveStatus
	 * @param {string} userId - The internal user ID used to look up user details in the database.
	 * @param {boolean} activeStatus - Indicates whether the user should be activated (`true`) or deactivated (`false`).
	 * @param {boolean} confirmRelinquish - Required when deactivating a user; confirms termination of all other sessions.
	 * @returns {Promise<Object>} A response object indicating success or failure.
	 * - On success: `{ statusCode: 200, message: 'STATUS_UPDATED', result: { success: true } }`
	 * - On failure (user not found): returns a 400 response with an appropriate error message.
	 *
	 * @throws {Error} If any error occurs during user lookup or API communication.
	 */
	static async setActiveStatus(userId, activeStatus, confirmRelinquish) {
		try {
			const userDetails = await userQueries.findOne({ user_id: userId })
			if (!userDetails) {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			await chatAPIs.setActiveStatus(activeStatus, userDetails.user_info.external_user_id, confirmRelinquish)
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'STATUS_UPDATED',
				result: { success: true },
			})
		} catch (error) {
			console.error('An error occurred:', error)
			throw error
		}
	}
}
