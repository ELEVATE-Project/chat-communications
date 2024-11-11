const communicationService = require('@services/communication')

module.exports = class Communication {
	async signup(req) {
		try {
			const sendEmail = await communicationService.signup(req.body)
			return sendEmail
		} catch (error) {
			return error
		}
	}

	async login(req) {
		try {
			const sendEmail = await communicationService.login(req.body)
			return sendEmail
		} catch (error) {
			return error
		}
	}
	async logout(req) {
		try {
			const sendEmail = await communicationService.logout(req.body)
			return sendEmail
		} catch (error) {
			return error
		}
	}
	async createRoom(req) {
		try {
			const sendEmail = await communicationService.createRoom(req.body)
			return sendEmail
		} catch (error) {
			return error
		}
	}
	async updateAvatar(req) {
		try {
			const sendEmail = await communicationService.updateAvatar(req.body.user_id, req.body.image_url)
			return sendEmail
		} catch (error) {
			return error
		}
	}
}
