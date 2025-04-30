export default () => ({
	microservices: {
		chats: {
			host: process.env.CHATS_MS_HOST || 'localhost',
			port: parseInt(process.env.CHATS_MS_PORT || '3001'),
		},
		messages: {
			host: process.env.MESSAGES_MS_HOST || 'localhost',
			port: parseInt(process.env.MESSAGES_MS_PORT || '3002'),
		},
		like: {
			host: process.env.LIKE_MS_HOST || 'localhost',
			port: parseInt(process.env.LIKE_MS_PORT || '3003'),
		},
		match: {
			host: process.env.MATCH_MS_HOST || 'localhost',
			port: parseInt(process.env.MATCH_MS_PORT || '3004'),
		},
		complaints: {
			host: process.env.COMPLAINTS_MS_HOST || 'localhost',
			port: parseInt(process.env.COMPLAINTS_MS_PORT || '3005'),
		},
	},
	websocket: {
		port: parseInt(process.env.WS_PORT || '8080'),
	},
})
