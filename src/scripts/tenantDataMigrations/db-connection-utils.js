'use strict'
require('dotenv').config({ path: '../../.env' })
const { Sequelize, QueryTypes } = require('sequelize')
const nodeEnv = process.env.NODE_ENV || 'development'

/**
 * Database Connection Utility for Chat Communications Service
 * Provides standardized database connection management for tenant migration scripts
 */
class DatabaseConnectionManager {
	constructor(options = {}) {
		// Environment-based configuration with fallbacks
		let databaseUrl

		switch (nodeEnv) {
			case 'production':
				databaseUrl = process.env.PROD_DATABASE_URL
				break
			case 'test':
				databaseUrl = process.env.TEST_DATABASE_URL
				break
			default:
				databaseUrl = process.env.DEV_DATABASE_URL
		}

		if (!databaseUrl) {
			throw new Error('Database URL not configured. Set DATABASE_URL or DEV_DATABASE_URL environment variable.')
		}

		// Pool configuration with environment variable support
		const poolConfig = {
			max: options.poolMax || parseInt(process.env.DB_POOL_MAX_CONNECTIONS) || 5,
			min: options.poolMin || parseInt(process.env.DB_POOL_MIN_CONNECTIONS) || 0,
			acquire: options.poolAcquire || parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
			idle: options.poolIdle || parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
		}

		// Standard Sequelize configuration following MentorED patterns
		this.sequelize = new Sequelize(databaseUrl, {
			dialect: 'postgres',
			logging: options.logging !== undefined ? options.logging : false,
			pool: poolConfig,
			define: {
				underscored: true,
				freezeTableName: true,
				paranoid: true,
				syncOnAssociation: true,
				timestamps: true,
				createdAt: 'created_at',
				updatedAt: 'updated_at',
				deletedAt: 'deleted_at',
			},
			...options.sequelizeOptions,
		})

		// Connection state tracking
		this.isConnected = false
		this.connectionInfo = null
		this.connectionErrors = []
	}

	/**
	 * Test database connection and authenticate
	 * @returns {Object} Connection result with status and details
	 */
	async checkConnection() {
		const startTime = Date.now()

		try {
			// Test basic connectivity
			await this.sequelize.authenticate()

			// Get database information
			const dbInfo = await this.sequelize.query(
				'SELECT current_database() as database, current_user as user, version() as version',
				{ type: QueryTypes.SELECT }
			)

			// Get connection pool status
			const poolStatus = {
				size: this.sequelize.connectionManager.pool.size,
				available: this.sequelize.connectionManager.pool.available,
				using: this.sequelize.connectionManager.pool.using,
				waiting: this.sequelize.connectionManager.pool.waiting,
			}

			this.isConnected = true
			this.connectionInfo = {
				database: dbInfo[0].database,
				user: dbInfo[0].user,
				version: dbInfo[0].version.split(' ')[0] + ' ' + dbInfo[0].version.split(' ')[1], // PostgreSQL version
				connectionTime: Date.now() - startTime,
				poolStatus: poolStatus,
				connectedAt: new Date().toISOString(),
			}

			return {
				success: true,
				message: `Connected to database: ${this.connectionInfo.database}`,
				details: this.connectionInfo,
			}
		} catch (error) {
			this.isConnected = false
			this.connectionErrors.push({
				error: error.message,
				timestamp: new Date().toISOString(),
				connectionTime: Date.now() - startTime,
			})

			return {
				success: false,
				message: `Database connection failed: ${error.message}`,
				error: error,
				details: {
					connectionTime: Date.now() - startTime,
					previousErrors: this.connectionErrors,
				},
			}
		}
	}

	/**
	 * Validate database connection with comprehensive checks
	 * @returns {Object} Validation result with detailed status
	 */
	async validateConnection() {
		const validation = {
			connectivity: false,
			permissions: false,
			tables: false,
			usersTable: false,
			details: {},
		}

		try {
			// 1. Basic connectivity check
			const connectionResult = await this.checkConnection()
			if (!connectionResult.success) {
				validation.details.connectivity = connectionResult.message
				return { success: false, validation, message: 'Basic connectivity failed' }
			}
			validation.connectivity = true

			// 2. Test basic permissions (SELECT, INSERT, UPDATE, DELETE)
			try {
				await this.sequelize.query('SELECT 1', { type: QueryTypes.SELECT })
				validation.permissions = true
			} catch (error) {
				validation.details.permissions = `Permission check failed: ${error.message}`
			}

			// 3. Check if required tables exist
			try {
				const tables = await this.sequelize.query(
					`
					SELECT table_name 
					FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_type = 'BASE TABLE'
					ORDER BY table_name
				`,
					{ type: QueryTypes.SELECT }
				)

				validation.tables = tables.length > 0
				validation.details.tableCount = tables.length
				validation.details.sampleTables = tables.slice(0, 5).map((t) => t.table_name)
			} catch (error) {
				validation.details.tables = `Table check failed: ${error.message}`
			}

			// 4. Check users table specifically
			try {
				const usersTableCheck = await this.sequelize.query(
					`
					SELECT EXISTS(
						SELECT FROM information_schema.tables 
						WHERE table_schema = 'public' 
						AND table_name = 'users'
					) as users_table_exists
				`,
					{ type: QueryTypes.SELECT }
				)

				validation.usersTable = usersTableCheck[0].users_table_exists
				validation.details.usersTable = usersTableCheck[0].users_table_exists
					? 'Users table exists'
					: 'Users table not found'
			} catch (error) {
				validation.details.usersTable = `Users table check failed: ${error.message}`
			}

			const allChecksPass =
				validation.connectivity && validation.permissions && validation.tables && validation.usersTable
			return {
				success: allChecksPass,
				validation,
				message: allChecksPass ? 'Database validation successful' : 'Some validation checks failed',
			}
		} catch (error) {
			return {
				success: false,
				validation,
				message: `Validation error: ${error.message}`,
				error,
			}
		}
	}

	/**
	 * Execute a query with error handling and logging
	 * @param {string} query SQL query to execute
	 * @param {Object} options Query options
	 * @returns {Promise} Query result
	 */
	async executeQuery(query, options = {}) {
		if (!this.isConnected) {
			const connectionResult = await this.checkConnection()
			if (!connectionResult.success) {
				throw new Error(`Database not connected: ${connectionResult.message}`)
			}
		}

		try {
			const startTime = Date.now()
			const result = await this.sequelize.query(query, {
				type: QueryTypes.SELECT,
				...options,
			})
			const executionTime = Date.now() - startTime

			if (options.logQueries) {
				console.log(`🔍 Query executed in ${executionTime}ms: ${query.substring(0, 100)}...`)
			}

			return result
		} catch (error) {
			console.error(`❌ Query failed: ${error.message}`)
			console.error(`Query: ${query}`)
			throw error
		}
	}

	/**
	 * Safely close database connection
	 * @returns {Promise} Cleanup result
	 */
	async close() {
		try {
			if (this.sequelize) {
				await this.sequelize.close()
				this.isConnected = false
				console.log('✅ Database connection closed successfully')
				return { success: true, message: 'Connection closed' }
			}
		} catch (error) {
			console.error(`❌ Error closing database connection: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Get Sequelize instance for direct access
	 * @returns {Sequelize} Sequelize instance
	 */
	getSequelize() {
		return this.sequelize
	}

	/**
	 * Get connection information
	 * @returns {Object} Connection details
	 */
	getConnectionInfo() {
		return {
			isConnected: this.isConnected,
			connectionInfo: this.connectionInfo,
			errors: this.connectionErrors,
		}
	}
}

module.exports = DatabaseConnectionManager
