export interface PhotoData {
	id: number
	key: string
	createdAt: Date
}

export interface UserArchiveData {
	user: {
		telegramId: string
		name: string
		town: string
		age: number
		bio: string
		createdAt: Date
		role: string
		status: string
	}
	photos: PhotoData[]
	statistics: {
		sentLikes: number
		receivedLikes: number
		sentComplaints: number
		receivedComplaints: number
		invitedUsers: number
	}
	deletion: {
		reason: string
		timestamp: string
	}
}

export interface UserWithRelations {
	telegramId: string
	name: string
	town: string
	age: number
	bio: string
	createdAt: Date
	role: string
	status: string
	photos: PhotoData[]
	likesSent: Array<{ id: number }>
	likesReceived: Array<{ id: number }>
	sentComplaints: Array<{ id: number }>
	receivedComplaints: Array<{ id: number }>
	invitedUsers: Array<{ telegramId: string }>
}
