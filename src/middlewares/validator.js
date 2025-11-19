const { validationResult } = require('express-validator');
const path = require('path');

module.exports = async (req, res, next) => {
    try {
        const version = req.params.version;
        const controllerName = req.params.controller;
        const method = req.params.method;

        // Dynamically load the validator for the given route
        const validatorPath = path.resolve(__dirname, `../validators/${version}/${controllerName}.js`);
        const validators = require(validatorPath);

        // If the method has validators, execute them
        if (validators[method]) {
            await Promise.all(validators[method].map((validation) => validation.run(req)));
        }

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                responseCode: 'VALIDATION_ERROR',
                message: 'Validation failed. Check input data.',
                errors: errors.array(),
            });
        }

        next();
    } catch (error) {
        // If no validator exists, continue without validation
        if (error.code === 'MODULE_NOT_FOUND') {
            return next();
        }
        next(error);
    }
};
