const communicationService = require('@services/communication')

module.exports = class Communication {
	/**
	 * Registers a new user on the chat platform using provided user details.
	 *
	 * @async
	 * @function signup
	 * @param {Object} req - The request object containing the user details in `req.body`.
	 * @returns {Promise<Object>} A response indicating signup success or failure.
	 * - On success: `{ statusCode: 201, message: 'USER_SIGNED_UP', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async signup(req) {
		try {
			const { tenant_code, ...bodyData } = req.body
			return await communicationService.signup(bodyData, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Logs a user into the chat platform using their user ID.
	 *
	 * @async
	 * @function login
	 * @param {Object} req - The request object containing `user_id` in `req.body`.
	 * @returns {Promise<Object>} A response object indicating login status.
	 * - On success: `{ statusCode: 200, message: 'USER_LOGGED_IN', result: {...} }`
	 * - On failure: Error object with message.
	 */

	async login(req) {
		try {
			const { tenant_code, ...bodyData } = req.body
			return await communicationService.login(bodyData, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Logs a user out from the chat platform.
	 *
	 * @async
	 * @function logout
	 * @param {Object} req - The request object containing `user_id` in `req.body`.
	 * @returns {Promise<Object>} A response object indicating logout result.
	 * - On success: `{ statusCode: 200, message: 'USER_LOGGED_OUT', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async logout(req) {
		try {
			const { tenant_code, ...bodyData } = req.body
			return await communicationService.logout(bodyData, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Creates a communication room (group chat) with specified users and optional initial message.
	 *
	 * @async
	 * @function createRoom
	 * @param {Object} req - The request object containing `usernames` and optionally `initial_message` in `req.body`.
	 * @returns {Promise<Object>} Response with room creation result.
	 * - On success: `{ statusCode: 201, message: 'ROOM_CREATED', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async createRoom(req) {
		try {
			const { tenant_code, ...bodyData } = req.body
			return await communicationService.createRoom(bodyData, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Updates the user's avatar on the communication platform.
	 *
	 * @async
	 * @function updateAvatar
	 * @param {Object} req - The request object containing `user_id` and `image_url` in `req.body`.
	 * @returns {Promise<Object>} A response object indicating avatar update result.
	 * - On success: `{ statusCode: 200, message: 'AVATAR_UPDATED', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async updateAvatar(req) {
		try {
			const { tenant_code, user_id, image_url } = req.body
			return await communicationService.updateAvatar(user_id, image_url, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Updates a user’s personal information like name on the chat platform.
	 *
	 * @async
	 * @function updateUser
	 * @param {Object} req - The request object containing `user_id` and `name` in `req.body`.
	 * @returns {Promise<Object>} A response indicating whether the update was successful.
	 * - On success: `{ statusCode: 200, message: 'USER_UPDATED', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async updateUser(req) {
		try {
			const { tenant_code, user_id, name } = req.body
			return await communicationService.updateUser(user_id, name, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Maps an external user ID to the internal system for communication linking.
	 *
	 * @async
	 * @function userMapping
	 * @param {Object} req - The request object containing `external_user_id` in `req.body`.
	 * @returns {Promise<Object>} A response with the mapped internal user ID or error message.
	 * - On success: `{ statusCode: 200, message: 'USER_MAPPED', result: {...} }`
	 * - On failure: Error object with message.
	 */
	async userMapping(req) {
		try {
			const { tenant_code, external_user_id } = req.body
			return await communicationService.userMapping(external_user_id, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Updates the active status of a user on the chat platform (e.g., Rocket.Chat)
	 * using their external user ID, which is retrieved from the database using the provided internal user ID.
	 *
	 * @async
	 * @function setActiveStatus
	 * @param {Object} req - The request object containing `user_id`, `activeStatus`, and `confirmRelinquish` in `req.body`.
	 * @returns {Promise<Object>} A response object indicating success or failure.
	 * - On success: `{ statusCode: 200, message: 'STATUS_UPDATED', result: { success: true } }`
	 * - On failure (user not found): returns a 400 response with an appropriate error message.
	 *
	 * @throws {Error} If any error occurs during user lookup or API communication.
	 */
	async setActiveStatus(req) {
		try {
			const { tenant_code, user_id, activeStatus, confirmRelinquish } = req.body
			return await communicationService.setActiveStatus(user_id, activeStatus, confirmRelinquish, tenant_code)
		} catch (error) {
			return error
		}
	}

	/**
	 * Removes the avatar of a user on the chat platform (e.g., Rocket.Chat)
	 * using their external user ID, which is retrieved from the database using the provided internal user ID.
	 *
	 * @async
	 * @function removeAvatar
	 * @param {Object} req - The request object containing `user_id` in `req.body`.
	 * @returns {Promise<Object>} A response object indicating success or failure.
	 * - On success: `{ statusCode: 200, message: 'IMAGE_RESET', result: { success: true } }`
	 * - On failure (e.g., missing user ID or API error): returns a 400 or 500 response with an appropriate error message.
	 *
	 * @throws {Error} If any error occurs during user lookup or API communication.
	 */
	async removeAvatar(req) {
		try {
			const { tenant_code, user_id } = req.body
			return await communicationService.removeAvatar(user_id, tenant_code)
		} catch (error) {
			return error
		}
	}
}
