export interface VideoResponse {
	id: number
	createdAt: Date
	updatedAt: Date
	key: string
	telegramId: string
	title?: string
	description?: string
	isPublished: boolean
	likesCount: number
	viewsCount: number
	url?: string
	psychologist?: {
		id: number
		name: string
		about: string
	}
}

export interface VideoWithUrl extends VideoResponse {
	url: string
}

export interface VideoListResponse {
	videos: VideoWithUrl[]
	total: number
}

export interface UploadVideoResponse {
	videoId: number
	key: string
}

export interface LikeVideoResponse {
	isLiked: boolean
	likesCount: number
}
