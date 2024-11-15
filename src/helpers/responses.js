/**
 * Success response
 * @method
 * @name successResponse
 * @param  {String} statusCode status code of the response.
 * @param  {String} responseCode response code.
 * @param  {String} message response message.
 * @param {String} result - result
 * @returns {JSON} Returns response format
 */
const successResponse = ({ statusCode = 200, responseCode = 'OK', message, result = [], meta = {} }) => {
	let response = {
		statusCode,
		responseCode,
		message,
		result,
		meta,
	}

	if (process.env.ENABLE_LOG) {
		console.debug('Request Response:', { response })
	}

	return response
}

/**
 * failure response
 * @method
 * @name failureResponse
 * @param  {String} statusCode status code of the failure response.
 * @param  {String} responseCode response code.
 * @param  {String} message response message.
 * @param {String} result - result
 * @returns {JSON} Returns response error
 */
const failureResponse = ({ message = 'Oops! Something Went Wrong.', statusCode = 500, responseCode }) => {
	const error = new Error(message)
	error.statusCode = statusCode
	error.responseCode = responseCode
	return error
}

module.exports = {
	successResponse,
	failureResponse,
}
